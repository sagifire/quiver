import { IncomingMessage, ServerResponse } from 'node:http';
export type Method = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';
export declare class RequestContext {
    req: IncomingMessage;
    res: ServerResponse;
    constructor(req: IncomingMessage, res: ServerResponse);
    url: URL;
    params: Record<string, string>;
    locals: Record<string, unknown>;
    limits: {
        bodySize: number;
        headerTimeoutMs: number;
        requestTimeoutMs: number;
    };
    status(code: number): this;
    header(k: string, v: string): this;
    json(obj: unknown): void;
    text(s: string): void;
    bodyRaw(limit?: number): Promise<Buffer>;
    bodyJson<T = unknown>(limit?: number): Promise<T>;
}
export type Handler<Ctx extends RequestContext = RequestContext> = (ctx: Ctx) => void | Promise<void>;
export type Pipe<Ctx extends RequestContext = RequestContext> = (ctx: Ctx) => void | Promise<void>;
export type RouteTypeName = string;
export interface RouteRuleBase<Ctx extends RequestContext = RequestContext> {
    type: RouteTypeName;
    handler: Handler<Ctx>;
    pipes?: readonly Pipe<Ctx>[];
}
export interface IRouteType<Ctx extends RequestContext = RequestContext, TRule extends RouteRuleBase<Ctx> = RouteRuleBase<Ctx>> {
    readonly typeName: RouteTypeName;
    addRule(rule: TRule): void;
    match(ctx: Ctx): ((ctx: Ctx) => void | Promise<void>) | null;
}
