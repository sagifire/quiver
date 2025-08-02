import { RequestContext, Handler, Pipe } from './http.js';
export declare function compose<Ctx extends RequestContext>(pipes: readonly Pipe<Ctx>[] | undefined, handler: Handler<Ctx>): Handler<Ctx>;
