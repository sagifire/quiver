export class HttpException extends Error {
    constructor(
        public statusCode: number,
        message = 'Http Error',
        public expose = statusCode < 500,
        public headers: Record<string, string> = {}
    ) { 
        super(message) 
    }
}
