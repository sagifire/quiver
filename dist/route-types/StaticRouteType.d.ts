import { RequestContext, IRouteType, RouteRuleBase, Handler } from '../core/http.js';
import { StaticIndex } from '../services/StaticIndex.js';
export interface StaticRule<Ctx extends RequestContext = RequestContext> extends RouteRuleBase<Ctx> {
    methods?: ('GET' | 'HEAD')[];
}
export declare class StaticRouteType<Ctx extends RequestContext = RequestContext> implements IRouteType<Ctx, StaticRule<Ctx>> {
    private cfg;
    readonly typeName: "STATIC";
    constructor(cfg: {
        index: StaticIndex;
    });
    addRule(_rule: StaticRule<Ctx>): void;
    match(ctx: RequestContext): Handler<Ctx> | null;
}
