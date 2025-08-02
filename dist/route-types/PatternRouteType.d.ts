import { IRouteType, Handler, RequestContext, RouteRuleBase } from '../core/http.js';
export type Method = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';
export interface PatternRule<Ctx extends RequestContext = RequestContext> extends RouteRuleBase<Ctx> {
    pattern: string;
    methods?: Method[];
    constraints?: Record<string, 'int' | 'uuid' | 'hex' | 'alpha' | RegExp | ((v: string) => boolean)>;
}
export declare class PatternRouteType<Ctx extends RequestContext = RequestContext> implements IRouteType<Ctx, PatternRule<Ctx>> {
    readonly typeName: "PATH_PATTERN";
    private root;
    addRule(rule: PatternRule<Ctx>): void;
    match(ctx: Ctx): Handler<Ctx> | null;
}
