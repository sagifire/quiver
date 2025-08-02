import { RequestContext, Handler, Pipe } from './http.js'

export function compose<Ctx extends RequestContext>(
    pipes: readonly Pipe<Ctx>[]|undefined,
    handler: Handler<Ctx>
): Handler<Ctx> {
    if (!pipes || pipes.length === 0) {
        return handler
    }
    return async (ctx: Ctx) => {
        for (const pipe of pipes) {
            await pipe(ctx)
        }
        return handler(ctx)
    }
}
