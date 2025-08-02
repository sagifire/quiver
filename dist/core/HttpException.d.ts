export declare class HttpException extends Error {
    statusCode: number;
    expose: boolean;
    headers: Record<string, string>;
    constructor(statusCode: number, message?: string, expose?: boolean, headers?: Record<string, string>);
}
