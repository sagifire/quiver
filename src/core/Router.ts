import { IncomingMessage, ServerResponse } from 'node:http'

import { HttpException } from './HttpException.js'
import { RequestContext, Pipe, IRouteType, RouteRuleBase } from './http.js'

type TypeNameOf<T> = T extends { typeName: infer N extends string } ? N : never
type RuleOf<T>     = T extends IRouteType<any, infer R> ? R : never

type Registry<Ctx extends RequestContext> = Record<string, IRouteType<Ctx, any>>
type DiscriminatedRuleUnion<TReg extends Registry<any>> =
    { [K in keyof TReg]:
        RuleOf<TReg[K]> & { type: K & string }
    }[keyof TReg]

    
type CtxFactory<Ctx extends RequestContext> =
    | { class: new (req: IncomingMessage, res: ServerResponse) => Ctx, factory?: never }
    | { factory: (req: IncomingMessage, res: ServerResponse) => Ctx, class?: never }
    | undefined

export class Router <
    Ctx extends RequestContext = RequestContext,
    TReg extends Registry<Ctx> = {}
> {
    private reg: TReg
    private order: string[] = []
    private ctxFactory?: CtxFactory<Ctx>
    private globalPipes: Array<(ctx: Ctx)=>void|Promise<void>> = []

    constructor(opts?: { context?: CtxFactory<Ctx> }) {
        this.reg = {} as TReg
        this.ctxFactory = opts?.context
    }


    useType<K extends string, T extends IRouteType<Ctx, any> & { typeName: K }>(
        type: T
    ): Router<Ctx, TReg & Record<K, T>> {
        (this.reg as any)[type.typeName] = type
        this.order.push(type.typeName)
        return this as any
    }

    useGlobalPipes(...pipes: Pipe<Ctx>[]) {
        this.globalPipes.push(...pipes)
        return this
    }

    addRule(rule: DiscriminatedRuleUnion<TReg>) {
        const t = (this.reg as any)[rule.type] as IRouteType<Ctx, RouteRuleBase<Ctx>> | undefined
        if (!t) throw new Error(`Route type "${rule.type}" is not registered`)
        
        const { type: _omit, ...pureRule } = rule as any
        t.addRule(pureRule)
        return this
    }

    addRules(rules: Array<DiscriminatedRuleUnion<TReg>>) {
        for (const r of rules) this.addRule(r)
        return this
    }

    private makeCtx(req: IncomingMessage, res: ServerResponse): Ctx {
        if (this.ctxFactory?.factory) return this.ctxFactory.factory(req, res)
        if (this.ctxFactory?.class)   return new this.ctxFactory.class(req, res)
        return new RequestContext(req, res) as Ctx
    }

    // Main server request handler
    async handler(req: IncomingMessage, res: ServerResponse) {
        const ctx = this.makeCtx(req, res)
        const base = 'http://' + (req.headers.host || 'localhost')
        ctx.url = new URL(req.url || '/', base)

        try {
            for (const globalPipe of this.globalPipes) {
                await globalPipe(ctx)
            }

            for (const name of this.order) {
                const routeType = (this.reg as any)[name] as IRouteType<Ctx, any>
                const exec = routeType.match(ctx)
                if (exec) {
                    return await exec(ctx)
                }
            }

            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ error: 'Not Found' }))
        } catch (e: any) {
            const code = e?.statusCode ?? 500
            res.statusCode = code
            if (e?.headers) for (const [k, v] of Object.entries(e.headers)) res.setHeader(k, String(v))
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ error: e?.expose ? e.message : 'Internal Server Error' }))
        }
    }
}
