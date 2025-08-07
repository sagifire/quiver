import { IncomingMessage, ServerResponse } from 'node:http';
import { RequestContext, Pipe, IRouteType, RouteRuleBase, RouteTypeName } from './http.js';
export type RuleRegistry<Ctx extends RequestContext> = Record<RouteTypeName, RouteRuleBase<Ctx>>;
export type RuleOfType<T, Ctx extends RequestContext> = T extends IRouteType<Ctx, infer R> ? R : never;
export type TypeRegistry<Ctx extends RequestContext> = Record<RouteTypeName, IRouteType<Ctx>>;
export type TypeNameOfRuleType<T> = T extends {
    typeName: infer R;
} ? R : never;
export type TypeNameOfRule<T> = T extends {
    type: infer R;
} ? R : never;
export type DiscriminatedRuleUnion<RuleRegistry extends Record<RouteTypeName, any>> = keyof RuleRegistry extends never ? never : RuleRegistry[keyof RuleRegistry];
export type CtxFactory<Ctx extends RequestContext> = {
    class: new (req: IncomingMessage, res: ServerResponse) => Ctx;
    factory?: never;
} | {
    factory: (req: IncomingMessage, res: ServerResponse) => Ctx;
    class?: never;
} | undefined;
export declare class Router<Ctx extends RequestContext = RequestContext, RReg extends RuleRegistry<Ctx> = {}> {
    private reg;
    private order;
    private ctxFactory?;
    private globalPipes;
    constructor(opts?: {
        context?: CtxFactory<Ctx>;
    });
    useType<T extends IRouteType<Ctx, RouteRuleBase<Ctx>>>(type: T): Router<Ctx, RReg & {
        [K in TypeNameOfRuleType<T>]: RuleOfType<T, Ctx>;
    }>;
    useGlobalPipes(...pipes: Pipe<Ctx>[]): this;
    addRule(rule: DiscriminatedRuleUnion<RReg>): this;
    addRules(rules: Array<DiscriminatedRuleUnion<RReg>>): this;
    private makeCtx;
    handler(req: IncomingMessage, res: ServerResponse): Promise<void>;
}
