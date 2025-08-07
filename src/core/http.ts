import type { IncomingMessage, ServerResponse } from 'node:http'

import { HttpException } from './HttpException.js'

export type Method =
    | 'GET'|'HEAD'|'POST'|'PUT'|'PATCH'|'DELETE'|'OPTIONS'

export class RequestContext {

    constructor(
        public req: IncomingMessage,
        public res: ServerResponse,
    ) {}

    url!: URL; // fill in router
    params: Record<string,string> = Object.create(null)
    locals: Record<string, unknown> = Object.create(null)

    // Configurable limits
    limits = { 
        bodySize: 16 * 1024, 
        headerTimeoutMs: 30_000, 
        requestTimeoutMs: 60_000 
    }

    // response API 
    status(code: number) { 
        this.res.statusCode = code
        return this
    }

    header(k: string, v: string) { 
        this.res.setHeader(k, v)
        return this
    }

    json(obj: unknown) {
        if (!this.res.hasHeader('Content-Type')) {
            this.res.setHeader('Content-Type', 'application/json; charset=utf-8')
        } 
        this.res.end(JSON.stringify(obj))
    }

    text(s: string) {
        if (!this.res.hasHeader('Content-Type')) {
            this.res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        }
        this.res.end(s)
    }

    // Request body with limit and abort-safe
    async bodyRaw(limit = this.limits.bodySize): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = []
            let size = 0, done = false
            const fail = (err: Error) => { 
                if (!done) { 
                    done = true
                    this.req.destroy()
                    reject(err)
                }
            }
            const ok = () => {
                if (!done) {
                    done = true
                    resolve(Buffer.concat(chunks))
                }
            }

            this.req.once('error', fail)
            this.req.once('aborted', () => fail(new HttpException(499, 'Client Closed Request', true)))
            this.req.on('data', (c: Buffer) => {
                size += c.length
                if (size > limit) return fail(new HttpException(413, 'Content Too Large', true))
                chunks.push(c)
            })
            this.req.once('end', ok)
        })
    }

    async bodyJson<T = unknown>(limit?: number): Promise<T> {
        const raw = await this.bodyRaw(limit);
        try { 
            return JSON.parse(raw.toString('utf8')) as T
        }
        catch { 
            throw new HttpException(400, 'Invalid JSON', true)
        }
    }
}

export type Handler<Ctx extends RequestContext = RequestContext> =
    (ctx: Ctx) => void | Promise<void>

export type Pipe<Ctx extends RequestContext = RequestContext> =
    (ctx: Ctx) => void | Promise<void>

export type RouteTypeName = string

export interface RouteRuleBase<Ctx extends RequestContext = RequestContext> {
    type: RouteTypeName
    handler: Handler<Ctx>
    pipes?: readonly Pipe<Ctx>[]
}

export interface IRouteType<
    Ctx extends RequestContext = RequestContext,
    TRule extends RouteRuleBase<Ctx> = RouteRuleBase<Ctx>
> {
    readonly typeName: RouteTypeName
    addRule(rule: TRule): void
    match(ctx: Ctx): ((ctx: Ctx) => void | Promise<void>) | null
}