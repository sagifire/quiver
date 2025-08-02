import { IRouteType, RouteRuleBase, RequestContext, Handler } from '../core/http.js';
export interface PathRule<Ctx extends RequestContext = RequestContext> extends RouteRuleBase<Ctx> {
    path: string;
    methods?: ('GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS')[];
}
export declare class PathRouteType<Ctx extends RequestContext = RequestContext> implements IRouteType<Ctx, PathRule<Ctx>> {
    readonly typeName: "PATH";
    private keys;
    private execs;
    addRule(rule: PathRule<Ctx>): void;
    match(ctx: RequestContext): Handler<Ctx> | null;
    private lowerBound;
}
