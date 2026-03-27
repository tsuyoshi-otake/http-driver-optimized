import type { ResponseFormat } from "../types/driver";

/**
 * Request deduplication - prevents duplicate concurrent requests.
 * If a request with the same key is already in-flight, returns the same promise.
 */
export class RequestDedup {
  private pending = new Map<string, Promise<ResponseFormat>>();

  buildKey(method: string, url: string, payload?: Record<string, unknown>): string {
    const payloadKey = payload && Object.keys(payload).length > 0
      ? JSON.stringify(payload) : "";
    return `${method}:${url}:${payloadKey}`;
  }

  async execute<T>(
    key: string,
    fn: () => Promise<ResponseFormat<T>>
  ): Promise<ResponseFormat<T>> {
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<ResponseFormat<T>>;

    const promise = fn().finally(() => {
      this.pending.delete(key);
    });

    this.pending.set(key, promise as Promise<ResponseFormat>);
    return promise;
  }

  get pendingCount(): number {
    return this.pending.size;
  }
}
