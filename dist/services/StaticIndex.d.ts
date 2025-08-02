export interface StaticIndexOptions {
    rootDir: string;
    urlBase: string;
    scanIntervalMs?: number;
    followSymlinks?: boolean;
}
export declare class StaticIndex {
    private opts;
    private map;
    private root;
    private base;
    private timer?;
    constructor(opts: StaticIndexOptions);
    start(): void;
    stop(): void;
    private rebuild;
    lookup(urlPath: string): string | undefined;
    resolveUrl(url: URL): string | undefined;
}
