import type { CacheConfig, ResponseFormat } from "../types/driver";
export declare class ResponseCache {
    private store;
    private config;
    constructor(config?: CacheConfig);
    get enabled(): boolean;
    buildKey(method: string, url: string, payload?: Record<string, unknown>): string;
    get<T>(key: string): ResponseFormat<T> | null;
    set(key: string, data: ResponseFormat): void;
    shouldCache(method: string): boolean;
    clear(): void;
    size(): number;
}
