import { IRouteType, Handler, RequestContext, RouteRuleBase, Method } from '../core/http.js';
export interface PatternRule<Ctx extends RequestContext = RequestContext> extends RouteRuleBase<Ctx> {
    type: 'PATTERN';
    pattern: string;
    methods?: Method[];
    constraints?: Record<string, 'int' | 'uuid' | 'hex' | 'alpha' | RegExp | ((v: string) => boolean)>;
}
export declare class PatternRouteType<Ctx extends RequestContext = RequestContext> implements IRouteType<Ctx, PatternRule<Ctx>> {
    readonly typeName = "PATTERN";
    private root;
    addRule(rule: PatternRule<Ctx>): void;
    match(ctx: Ctx): Handler<Ctx> | null;
}
