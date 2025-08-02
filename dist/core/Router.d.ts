import { IncomingMessage, ServerResponse } from 'node:http';
import { RequestContext, Pipe, IRouteType } from './http.js';
type RuleOf<T> = T extends IRouteType<any, infer R> ? R : never;
type Registry<Ctx extends RequestContext> = Record<string, IRouteType<Ctx, any>>;
type DiscriminatedRuleUnion<TReg extends Registry<any>> = {
    [K in keyof TReg]: RuleOf<TReg[K]> & {
        type: K & string;
    };
}[keyof TReg];
type CtxFactory<Ctx extends RequestContext> = {
    class: new (req: IncomingMessage, res: ServerResponse) => Ctx;
    factory?: never;
} | {
    factory: (req: IncomingMessage, res: ServerResponse) => Ctx;
    class?: never;
} | undefined;
export declare class Router<Ctx extends RequestContext = RequestContext, TReg extends Registry<Ctx> = {}> {
    private reg;
    private order;
    private ctxFactory?;
    private globalPipes;
    constructor(opts?: {
        context?: CtxFactory<Ctx>;
    });
    useType<K extends string, T extends IRouteType<Ctx, any> & {
        typeName: K;
    }>(type: T): Router<Ctx, TReg & Record<K, T>>;
    useGlobalPipes(...pipes: Pipe<Ctx>[]): this;
    addRule(rule: DiscriminatedRuleUnion<TReg>): this;
    addRules(rules: Array<DiscriminatedRuleUnion<TReg>>): this;
    private makeCtx;
    handler(req: IncomingMessage, res: ServerResponse): Promise<void>;
}
export {};
