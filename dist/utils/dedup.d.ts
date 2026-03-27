import type { ResponseFormat } from "../types/driver";
/**
 * Request deduplication - prevents duplicate concurrent requests.
 * If a request with the same key is already in-flight, returns the same promise.
 */
export declare class RequestDedup {
    private pending;
    buildKey(method: string, url: string, payload?: Record<string, unknown>): string;
    execute<T>(key: string, fn: () => Promise<ResponseFormat<T>>): Promise<ResponseFormat<T>>;
    get pendingCount(): number;
}
