import { IncomingMessage, ServerResponse } from 'node:http'

import { RequestContext, Pipe, IRouteType, RouteRuleBase, RouteTypeName } from './http.js'

export type RuleRegistry<Ctx extends RequestContext> = Record<RouteTypeName, RouteRuleBase<Ctx>>

export type RuleOfType<T, Ctx extends RequestContext> = T extends IRouteType<Ctx, infer R> ? R : never

export type TypeRegistry<Ctx extends RequestContext> = Record<RouteTypeName, IRouteType<Ctx>>

export type TypeNameOfRuleType<T> = T extends { typeName: infer R } ? R : never
export type TypeNameOfRule<T> = T extends { type: infer R } ? R : never

export type DiscriminatedRuleUnion<RuleRegistry extends Record<RouteTypeName, any>> =
    keyof RuleRegistry extends never
        ? never
        : RuleRegistry[keyof RuleRegistry]

export type CtxFactory<Ctx extends RequestContext> =
    | { class: new (req: IncomingMessage, res: ServerResponse) => Ctx, factory?: never }
    | { factory: (req: IncomingMessage, res: ServerResponse) => Ctx, class?: never }
    | undefined        

export class Router<
    Ctx extends RequestContext = RequestContext,
    RReg extends RuleRegistry<Ctx> = {}
> {
    private reg: TypeRegistry<Ctx>
    private order: string[] = []
    private ctxFactory?: CtxFactory<Ctx>
    private globalPipes: Array<Pipe<Ctx>> = []

    constructor(opts?: { context?: CtxFactory<Ctx> }) {
        this.reg = {} as TypeRegistry<Ctx>
        this.ctxFactory = opts?.context
    }

    useType<T extends IRouteType<Ctx, RouteRuleBase<Ctx>>>(
        type: T
    ): Router<Ctx, RReg & { [K in TypeNameOfRuleType<T>]: RuleOfType<T, Ctx> }> {
        ;(this.reg as any)[type.typeName] = type
        this.order.push(type.typeName)
        return this as unknown as Router<Ctx, RReg & { [K in TypeNameOfRuleType<T>]: RuleOfType<T, Ctx>}>
    }

    useGlobalPipes(...pipes: Pipe<Ctx>[]) {
        this.globalPipes.push(...pipes)
        return this
    }

    addRule(rule: DiscriminatedRuleUnion<RReg>) {
        const typeName = (rule as any).type as keyof RReg
        const rt = (this.reg as any)[typeName] as IRouteType<Ctx, RouteRuleBase<Ctx>> | undefined
        if (!rt) {
            throw new Error(`Route type "${String(typeName)}" is not registered`)
        }
        const { type: _omit, ...pureRule } = rule as any
        rt.addRule(pureRule)
        return this
    }

    addRules(rules: Array<DiscriminatedRuleUnion<RReg>>) {
        for (const r of rules) {
            this.addRule(r)
        }
        return this
    }

    private makeCtx(req: IncomingMessage, res: ServerResponse): Ctx {
        if (this.ctxFactory?.factory) {
            return this.ctxFactory.factory(req, res)
        }
        if (this.ctxFactory?.class) {
            return new this.ctxFactory.class(req, res)
        }
        return new RequestContext(req, res) as Ctx
    }

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
            if (e?.headers) {
                for (const [k, v] of Object.entries(e.headers)) {
                    res.setHeader(k, String(v))
                }
            }
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ error: e?.expose ? e.message : 'Internal Server Error' }))
        }
    }
}