// static-index.ts
import { promises as fsp } from 'node:fs'
import path from 'node:path'

export interface StaticIndexOptions {
    rootDir: string
    urlBase: string
    scanIntervalMs?: number
    followSymlinks?: boolean
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
        const next = new Map<string,string>()
        const walk = async (dirAbs: string, rel: string) => {
            const entries = await fsp.readdir(dirAbs, { withFileTypes: true })
            for (const e of entries) {
                const name = e.name;
                if (name.startsWith('.')) {
                    continue // ховаємо dotfiles
                }
                const childAbs = path.join(dirAbs, name)
                const childRel = rel ? rel + '/' + name : name
                if (e.isDirectory()) {
                    await walk(childAbs, childRel)
                } else if (e.isFile()) {
                    const urlPath = this.base + '/' + childRel.replace(/\\/g,'/')
                    next.set(urlPath, childAbs)
                }
            }
        }
        await walk(this.root, '')
        // Атомарна заміна, читачі користуються "map"
        this.map = next
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
