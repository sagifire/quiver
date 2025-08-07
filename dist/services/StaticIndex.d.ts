export interface StaticIndexOptions {
    rootDir: string;
    urlBase: string;
    scanIntervalMs?: number;
    followSymlinks?: boolean;
    maxFiles?: number;
    maxDepth?: number;
    allowWellKnown?: boolean;
    logger?: {
        warn: (...params: any[]) => void;
        debug: (...params: any[]) => void;
    };
}
export declare class StaticIndex {
    private opts;
    private map;
    private root;
    private base;
    private timer?;
    constructor(opts: StaticIndexOptions);
    start(): Promise<void>;
    stop(): void;
    private rebuild;
    lookup(urlPath: string): string | undefined;
    resolveUrl(url: URL): string | undefined;
}
