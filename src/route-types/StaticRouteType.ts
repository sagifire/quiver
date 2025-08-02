import { createReadStream, promises as fsp } from 'node:fs'
import { extname } from 'node:path'

import { RequestContext, IRouteType, RouteRuleBase, Handler } from '../core/http.js'

import { StaticIndex } from '../services/StaticIndex.js'

const CT: Record<string,string> = {
    '.html':'text/html; charset=utf-8', '.json':'application/json; charset=utf-8', '.txt':'text/plain; charset=utf-8',
    '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
    '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.svg':'image/svg+xml',
    '.mp4':'video/mp4', '.webm':'video/webm', '.mp3':'audio/mpeg', '.wav':'audio/wav',
};

export interface StaticRule<Ctx extends RequestContext = RequestContext>
    extends RouteRuleBase<Ctx> 
{
    methods?: ('GET'|'HEAD')[]
}


export class StaticRouteType<Ctx extends RequestContext = RequestContext>
    implements IRouteType<Ctx, StaticRule<Ctx>> 
{
    readonly typeName = 'STATIC' as const
    constructor(private cfg: { index: StaticIndex }) {}

    addRule(_rule: StaticRule<Ctx>): void {
        // для STATIC зазвичай 1 правило на індекс; pipes можна навісити глобально на Router або тут
    }

    match(ctx: RequestContext): Handler<Ctx> | null {
        if (ctx.req.method !== 'GET' && ctx.req.method !== 'HEAD') {
            return null
        }
        const abs = this.cfg.index.resolveUrl(ctx.url)
        if (!abs) return null

        return async (c: RequestContext): Promise<void>  => {
            const stats = await fsp.stat(abs)
            const size = stats.size
            const isHead = c.req.method === 'HEAD'

            const ext = extname(abs).toLowerCase()
            c.header('X-Content-Type-Options', 'nosniff')
            c.header('Accept-Ranges', 'bytes')
            c.header('Last-Modified', stats.mtime.toUTCString())
            c.header('Content-Type', CT[ext] || 'application/octet-stream')

            // ETag слабкий: W/"size-mtimeMs"
            const etag = `W/"${size}-${Math.trunc(stats.mtimeMs)}"`
            c.header('ETag', etag)
            if (c.req.headers['if-none-match'] === etag) { 
                c.status(304)
                c.res.end()
                return
            }

            const range = c.req.headers['range']
            if (range && range.startsWith('bytes=')) {
                let [s, e] = range.slice(6).split('-')
                let start = s ? parseInt(s, 10) : 0
                let end = e ? parseInt(e, 10) : size - 1
                if (Number.isNaN(start)) start = 0
                if (Number.isNaN(end)) end = size - 1
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
                const rs = createReadStream(abs, { start, end })
                rs.on('error', () => c.res.destroy())
                rs.pipe(c.res)
                return
            }

            c.status(200).header('Content-Length', String(size))
            if (isHead) {
                c.res.end()
                return 
            }
            const rs = createReadStream(abs)
            rs.on('error', () => c.res.destroy())
            rs.pipe(c.res)
        }
    }
}
