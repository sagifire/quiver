// static-index.ts
import { promises as fsp, Dirent, Stats } from 'node:fs'
import path from 'node:path'

export interface StaticIndexOptions {
    rootDir: string
    urlBase: string
    scanIntervalMs?: number
    followSymlinks?: boolean
    maxFiles?: number
    maxDepth?: number
    allowWellKnown?: boolean
    logger?: {
        warn: (...params:any[]) => void
        debug: (...params:any[]) => void
    }
}

export class StaticIndex {
    private map = new Map<string,string>() // "/static/a/b.js" => "/abs/a/b.js"
    private root!: string
    private base!: string
    private timer?: NodeJS.Timeout

    constructor(private opts: StaticIndexOptions) {
        this.root = path.resolve(opts.rootDir)
        this.base = opts.urlBase.endsWith('/') ? opts.urlBase.slice(0,-1) : opts.urlBase
    }

    start() {
        this.rebuild().catch(()=>{})
        if (this.opts.scanIntervalMs) {
            this.timer = setInterval(() => this.rebuild().catch(()=>{}), this.opts.scanIntervalMs).unref()
        }
    }

    stop() { 
        if (this.timer) clearInterval(this.timer)
    }

    // O(#files). Для великих дерев — інкрементал або шардінг по підкаталогах
    private async rebuild() {
        const next = new Map<string, string>()
        const visitedDirs = new Set<string>()

        // 1) Real root
        const rootReal = await fsp.realpath(this.root).catch(() => this.root)

        const inRoot = (p: string) =>
            p === rootReal || p.startsWith(rootReal + path.sep)

        const walk = async (dirAbs: string, rel: string, depth = 0) => {
            // (optional) depth limit
            if (this.opts.maxDepth && depth > this.opts.maxDepth) {
                return
            }

            let entries: Dirent[]
            try {
                entries = await fsp.readdir(dirAbs, { withFileTypes: true })
            } catch (err) {
                this.opts.logger?.warn?.(`readdir failed: ${dirAbs}`, err)
                return
            }

            // loop protection 
            let dirReal = await fsp.realpath(dirAbs).catch(() => dirAbs)
            if (!inRoot(dirReal)) return; // don't index files without root
            if (visitedDirs.has(dirReal)) {
                return
            }
            visitedDirs.add(dirReal)

            for (const e of entries) {
                const name = e.name
                if (name.startsWith('.')) {
                    if (!(this.opts.allowWellKnown && name === '.well-known')) {
                        continue
                    }
                }

                const childAbs = path.join(dirAbs, name)
                const childRel = rel ? rel + '/' + name : name

                let lst: Stats
                try {
                    lst = await fsp.lstat(childAbs) // without transition
                } catch (error) {
                    this.opts.logger?.debug?.(`lstat failed: ${childAbs}`, error)
                    continue
                }

                // Symlink
                if (lst.isSymbolicLink()) {
                    if (!this.opts.followSymlinks) continue
                    let targetReal: string
                    try {
                        targetReal = await fsp.realpath(childAbs)
                    } catch (error) {
                        this.opts.logger?.debug?.(`realpath failed: ${childAbs}`, error)
                        continue;
                    }
                    if (!inRoot(targetReal)) {
                        continue
                    }

                    // Classifying the target
                    let st: Stats
                    try {
                        st = await fsp.stat(childAbs)
                    } catch (error) {
                        this.opts.logger?.debug?.(`stat failed: ${childAbs}`, error)
                        continue
                    }
                    if (st.isDirectory()) {
                        await walk(childAbs, childRel, depth + 1)
                    } else if (st.isFile()) {
                        const urlPath = `${this.base}/${childRel.split(path.sep).join('/')}`
                        next.set(urlPath, childAbs); // save the path via link — ok
                    }
                    continue
                }

                // Normal files/directories
                if (lst.isDirectory()) {
                    await walk(childAbs, childRel, depth + 1)
                } else if (lst.isFile()) {
                    const urlPath = `${this.base}/${childRel.split(path.sep).join('/')}`
                    next.set(urlPath, childAbs)
                }
                // other types — ignore
            }
        };

        await walk(this.root, '')

        // (optional) quantity limit
        if (this.opts.maxFiles && next.size > this.opts.maxFiles) {
            this.opts.logger?.warn?.(`file index truncated: ${next.size} > ${this.opts.maxFiles}`)
        }

        this.map = next // atomic replacement
    }

    lookup(urlPath: string): string | undefined {
        return this.map.get(urlPath)
    }

    resolveUrl(url: URL): string | undefined {
        const pathname = url.pathname
        if (!(pathname === this.base || pathname.startsWith(this.base + '/'))) {
            return undefined
        }
        const abs = this.lookup(pathname)
        // додатковий рантайм-захист від traversal (хоч ми індексуємо, все одно перевіримо):
        if (abs && abs.startsWith(this.root)) {
            return abs
        }
        return undefined
    }
}
