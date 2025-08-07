import { Stats } from 'node:fs';
import { RequestContext, IRouteType, RouteRuleBase, Handler } from '../core/http.js';
import { StaticIndex } from '../services/StaticIndex.js';
export type ContentTypeMap = Record<string, string>;
type Encoding = 'br' | 'gzip';
export interface PrecompressedOptions {
    enabled?: boolean;
    prefer?: Encoding[];
    useSiblingFiles?: boolean;
    resolver?: (abs: string, acceptEncodingHeader: string | undefined) => Promise<{
        path: string;
        encoding: Encoding;
    } | null>;
    allowRangesForCompressed?: boolean;
    alwaysSetVary?: boolean;
}
export interface StaticRouteOptions {
    index: StaticIndex;
    resolveContentType?: (ext: string, absPath: string, stats: Stats, ctx: RequestContext) => string | undefined;
    contentTypes?: ContentTypeMap;
    defaultContentType?: string;
    defaultTextCharset?: string | false;
    precompressed?: PrecompressedOptions;
}
export interface StaticRule<Ctx extends RequestContext = RequestContext> extends RouteRuleBase<Ctx> {
    type: 'STATIC';
    methods?: ('GET' | 'HEAD')[];
}
export declare class StaticRouteType<Ctx extends RequestContext = RequestContext> implements IRouteType<Ctx, StaticRule<Ctx>> {
    private cfg;
    readonly typeName = "STATIC";
    private readonly ct;
    private readonly resolveCT?;
    private readonly defaultCT;
    private readonly defaultTextCharset;
    private readonly pre;
    constructor(cfg: StaticRouteOptions);
    addRule(_rule: StaticRule<Ctx>): void;
    match(ctx: Ctx): Handler<Ctx> | null;
}
export {};
