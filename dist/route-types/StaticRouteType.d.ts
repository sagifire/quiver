import { Stats } from 'node:fs';
import { RequestContext, IRouteType, RouteRuleBase, Handler } from '../core/http.js';
import { StaticIndex } from '../services/StaticIndex.js';
export type ContentTypeMap = Record<string, string>;
export interface StaticRouteOptions {
    index: StaticIndex;
    /** Complete custom MIME resolver function. Takes precedence over the map. */
    resolveContentType?: (ext: string, absPath: string, stats: Stats, ctx: RequestContext) => string | undefined;
    /** Additional or alternative types. Keys are extensions with a dot, e.g. ".md". */
    contentTypes?: ContentTypeMap;
    /** MIME is the default if nothing else works. */
    defaultContentType?: string;
    /** Auto-add charset for text/* and application/json. Default is 'utf-8'. */
    defaultTextCharset?: string | false;
}
export interface StaticRule<Ctx extends RequestContext = RequestContext> extends RouteRuleBase<Ctx> {
    methods?: ('GET' | 'HEAD')[];
}
export declare class StaticRouteType<Ctx extends RequestContext = RequestContext> implements IRouteType<Ctx, StaticRule<Ctx>> {
    private cfg;
    readonly typeName: "STATIC";
    private readonly ct;
    private readonly resolveCT?;
    private readonly defaultCT;
    private readonly defaultTextCharset;
    constructor(cfg: StaticRouteOptions);
    addRule(_rule: StaticRule<Ctx>): void;
    match(ctx: Ctx): Handler<Ctx> | null;
}
