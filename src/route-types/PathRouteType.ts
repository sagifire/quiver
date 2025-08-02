
import { IRouteType, RouteRuleBase, Pipe, RequestContext, Handler } from '../core/http.js'

export interface PathRule<Ctx extends RequestContext = RequestContext>
    extends RouteRuleBase<Ctx> 
{
    path: string
    methods?: ('GET'|'HEAD'|'POST'|'PUT'|'PATCH'|'DELETE'|'OPTIONS')[]
}

function compose<Ctx extends RequestContext = RequestContext>(pipes: readonly Pipe<Ctx>[] | undefined, handler: Handler<Ctx>): Handler<Ctx> {
    if (!pipes || pipes.length === 0) return handler
    // flat loop for — minimal overhead
    return async (ctx: Ctx) => {
        for (const pipe of pipes) { 
            await pipe(ctx)
        }
        return handler(ctx)
    }
}

export class PathRouteType<Ctx extends RequestContext = RequestContext>
    implements IRouteType<Ctx, PathRule<Ctx>> 
{  
    readonly typeName = 'PATH' as const
    private keys: string[] = []  // "GET /health"   (upper method)
    private execs: Handler<Ctx>[] = []

    addRule(rule: PathRule<Ctx>): void {
        const methods = rule.methods?.length ? rule.methods : ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']
        const exe = compose(rule.pipes, rule.handler)
        for (const m of methods) {
            const key = `${m} ${rule.path}`            
            let i = this.lowerBound(this.keys, key)
            this.keys.splice(i, 0, key)
            this.execs.splice(i, 0, exe)
        }
    }

    match(ctx: RequestContext): Handler<Ctx> | null {
        const method = (ctx.req.method || 'GET').toUpperCase()
        const key = `${method} ${ctx.url.pathname.replace(/\/$/, '') || '/'}`;
        const i = this.lowerBound(this.keys, key);
        return (i < this.keys.length && this.keys[i] === key) 
            ? this.execs[i]!
            : null
    }

    private lowerBound(arr: string[], key: string): number {
        let l = 0, r = arr.length;
        while(l < r) { 
            const mid = (l + r >>> 1)
            if (arr[mid]! < key) {
                l = mid + 1
            } else {
                r = mid
            }
        }
        return l
    }
}
