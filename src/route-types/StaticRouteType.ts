import { createReadStream, promises as fsp, Stats } from 'node:fs'
import { extname } from 'node:path'

import { RequestContext, IRouteType, RouteRuleBase, Handler } from '../core/http.js'
import { StaticIndex } from '../services/StaticIndex.js'

export type ContentTypeMap = Record<string, string>

type Encoding = 'br' | 'gzip'

export interface PrecompressedOptions {
    enabled?: boolean
    prefer?: Encoding[]
    useSiblingFiles?: boolean
    resolver?: (abs: string, acceptEncodingHeader: string|undefined) =>
        Promise<{ path: string, encoding: Encoding }|null>
    allowRangesForCompressed?: boolean
    alwaysSetVary?: boolean
}

type NormalizedPrecompressed = {
    enabled: boolean
    prefer: Encoding[]
    useSiblingFiles: boolean
    resolver?: (abs: string, acceptEncodingHeader: string|undefined) =>
        Promise<{ path: string, encoding: Encoding }|null>
    allowRangesForCompressed: boolean
    alwaysSetVary: boolean
}

export interface StaticRouteOptions {
    index: StaticIndex

    resolveContentType?: (
        ext: string,
        absPath: string,
        stats: Stats,
        ctx: RequestContext
    ) => string | undefined

    contentTypes?: ContentTypeMap
    defaultContentType?: string
    defaultTextCharset?: string | false
    precompressed?: PrecompressedOptions
}

const BASE_CT: ContentTypeMap = {
    '.html':'text/html; charset=utf-8', '.json':'application/json; charset=utf-8', '.txt':'text/plain; charset=utf-8',
    '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
    '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.svg':'image/svg+xml',
    '.mp4':'video/mp4', '.webm':'video/webm', '.mp3':'audio/mpeg', '.wav':'audio/wav',
}

function normalizeCTMap(src?: ContentTypeMap): ContentTypeMap {
    if (!src) {
        return {}
    }
    const out: ContentTypeMap = {}
    for (const [k, v] of Object.entries(src)) {
        const key = k.startsWith('.') ? k.toLowerCase() : ('.' + k.toLowerCase())
        out[key] = v
    }
    return out
}

function maybeAppendCharset(mime: string, charset: string | false | undefined): string {
    if (!charset) {
        return mime
    }
    if ((/^text\//.test(mime) || /^application\/json\b/.test(mime)) && !/;\s*charset=/i.test(mime)) {
        return `${mime}; charset=${charset}`
    }
    return mime
}

function parseAcceptEncoding(h: string|undefined) {
    const out = new Map<string, number>()
    if (!h) {
        return out
    }
    const parts = h.split(',')
    for (const raw of parts) {
        const piece = raw.trim()
        if (!piece) {
            continue
        }
        const sub = piece.split(';')
        const token = sub[0]?.trim()?.toLowerCase()
        if (!token) {
            continue
        }
        let q = 1
        for (let i = 1; i < sub.length; i++) {
            const [k, v] = sub[i]!.split('=').map(s => s.trim())
            if (k && k.toLowerCase() === 'q') {
                const n = Number(v)
                if (!Number.isNaN(n)) {
                    q = n
                }
            }
        }
        out.set(token, q)
    }
    return out
}

async function trySiblingCompressed(
    abs: string,
    prefer: Encoding[],
    accept: Map<string, number>
): Promise<{ path: string, encoding: Encoding }|null> {
    for (const enc of prefer) {
        const q = accept.get(enc)
        if (q === 0) {
            continue
        }
        if (q === undefined && accept.size > 0) {
            continue
        }
        const candidate = `${abs}.${enc === 'br' ? 'br' : 'gz'}`
        try {
            const st = await fsp.stat(candidate)
            if (st.isFile()) {
                return { path: candidate, encoding: enc }
            }
        } catch {}
    }
    return null
}

export interface StaticRule<Ctx extends RequestContext = RequestContext>
    extends RouteRuleBase<Ctx>
{
    type: 'STATIC'
    methods?: ('GET'|'HEAD')[]
}

export class StaticRouteType<Ctx extends RequestContext = RequestContext>
    implements IRouteType<Ctx, StaticRule<Ctx>>
{
    readonly typeName = 'STATIC'

    private readonly ct: ContentTypeMap
    private readonly resolveCT?: StaticRouteOptions['resolveContentType']
    private readonly defaultCT: string
    private readonly defaultTextCharset: string | false

    private readonly pre: NormalizedPrecompressed

    constructor(private cfg: StaticRouteOptions) {
        this.resolveCT = cfg.resolveContentType
        this.ct = { ...BASE_CT, ...normalizeCTMap(cfg.contentTypes) }
        this.defaultCT = cfg.defaultContentType ?? 'application/octet-stream'
        this.defaultTextCharset = cfg.defaultTextCharset ?? 'utf-8'

        const p = cfg.precompressed ?? {}
        this.pre = {
            enabled: p.enabled ?? false,
            prefer: p.prefer ?? ['br', 'gzip'],
            useSiblingFiles: p.useSiblingFiles ?? true,
            resolver: p.resolver, // опційний
            allowRangesForCompressed: p.allowRangesForCompressed ?? false,
            alwaysSetVary: p.alwaysSetVary ?? true
        }
    }

    addRule(_rule: StaticRule<Ctx>) {
        // зазвичай 1 правило на індекс; pipes можна навісити глобально на Router або тут
    }

    match(ctx: Ctx): Handler<Ctx> | null {
        if (ctx.req.method !== 'GET' && ctx.req.method !== 'HEAD') {
            return null
        }
        // Inspect the raw request URL to detect literal or percent-encoded traversal attempts
        // (e.g. "/../index.html" or "/%2e%2e/index.html"). The ctx.url (WHATWG URL) may
        // normalize dot segments; checking ctx.req.url preserves the original raw path.
        const raw = String(ctx.req.url ?? '')
        const rawPath = raw.split('?')[0]!.split('#')[0]!
        let decodedRaw = rawPath
        try {
            decodedRaw = decodeURIComponent(rawPath)
        } catch {}        
        if (decodedRaw.split('/').includes('..')) {
            return null
        }

        const abs = this.cfg.index.resolveUrl(ctx.url)
        if (!abs) {
            return null
        }

        return async (c: Ctx): Promise<void>  => {
            const origStats = await fsp.stat(abs)
            const origSize = origStats.size
            const isHead = c.req.method === 'HEAD'

            const ext = extname(abs).toLowerCase()
            const resolvedMime =
                this.resolveCT?.(ext, abs, origStats, c)
                ?? this.ct[ext]
                ?? this.defaultCT

            c.header('X-Content-Type-Options', 'nosniff')
            c.header('Last-Modified', origStats.mtime.toUTCString())
            c.header('Content-Type', maybeAppendCharset(resolvedMime, this.defaultTextCharset))

            let filePath = abs
            let effStats = origStats
            let encoding: Encoding|null = null

            if (this.pre.enabled) {
                const accept = parseAcceptEncoding(c.req.headers['accept-encoding'] as string|undefined)

                if (this.pre.alwaysSetVary) {
                    c.header('Vary', 'Accept-Encoding')
                }

                let resolved: { path: string, encoding: Encoding }|null = null
                if (this.pre.resolver) {
                    resolved = await this.pre.resolver(abs, c.req.headers['accept-encoding'] as string|undefined)
                } else if (this.pre.useSiblingFiles && accept.size > 0) {
                    // Only consider sibling precompressed files when the client explicitly
                    // provided Accept-Encoding tokens. When the header is absent, prefer
                    // serving the original file (tests expect this behavior).
                    resolved = await trySiblingCompressed(abs, this.pre.prefer, accept)
                }

                if (resolved) {
                    filePath = resolved.path
                    encoding = resolved.encoding
                    effStats = await fsp.stat(filePath)
                    c.header('Content-Encoding', encoding)
                }
            }

            const size = effStats.size
            const etag = encoding
                ? `W/"${size}-${Math.trunc(effStats.mtimeMs)}-${encoding}"`
                : `W/"${origSize}-${Math.trunc(origStats.mtimeMs)}"`
            c.header('ETag', etag)

            const inm = c.req.headers['if-none-match'] as string|undefined
            if (inm && inm === etag) {
                c.status(304)
                c.res.end()
                return
            }

            if (!encoding || this.pre.allowRangesForCompressed) {
                c.header('Accept-Ranges', 'bytes')
                const range = c.req.headers['range'] as string|undefined
                if (range && range.startsWith('bytes=')) {
                    let [s, e] = range.slice(6).split('-')
                    let start = s ? parseInt(s, 10) : 0
                    let end = e ? parseInt(e, 10) : size - 1
                    if (Number.isNaN(start)) {
                        start = 0
                    }
                    if (Number.isNaN(end)) {
                        end = size - 1
                    }
                    if (start > end || start >= size) {
                        c.status(416).header('Content-Range', `bytes */${size}`)
                        c.res.end()
                        return
                    }
                    c.status(206).header('Content-Range', `bytes ${start}-${end}/${size}`)
                    c.header('Content-Length', String(end - start + 1))
                    if (isHead) {
                        c.res.end()
                        return
                    }
                    const rs = createReadStream(filePath, { start, end })
                    rs.on('error', () => c.res.destroy())
                    rs.pipe(c.res)
                    return
                }
            } else {
                c.header('Accept-Ranges', 'none')
            }

            c.status(200).header('Content-Length', String(size))
            if (isHead) {
                c.res.end()
                return
            }
            const rs = createReadStream(filePath)
            rs.on('error', () => c.res.destroy())
            rs.pipe(c.res)
        }
    }
}
