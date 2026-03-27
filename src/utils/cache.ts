import type { CacheConfig, ResponseFormat } from "../types/driver";

interface CacheEntry {
  data: ResponseFormat;
  expiry: number;
}

export class ResponseCache {
  private store = new Map<string, CacheEntry>();
  private config: Required<CacheConfig>;

  constructor(config?: CacheConfig) {
    this.config = {
      enabled: config?.enabled ?? false,
      ttl: config?.ttl ?? 30000,
      getOnly: config?.getOnly ?? true,
    };
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  buildKey(method: string, url: string, payload?: Record<string, unknown>): string {
    const payloadKey = payload && Object.keys(payload).length > 0
      ? JSON.stringify(payload) : "";
    return `${method}:${url}:${payloadKey}`;
  }

  get<T>(key: string): ResponseFormat<T> | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      return null;
    }
    return entry.data as ResponseFormat<T>;
  }

  set(key: string, data: ResponseFormat): void {
    this.store.set(key, { data, expiry: Date.now() + this.config.ttl });
  }

  shouldCache(method: string): boolean {
    if (!this.config.enabled) return false;
    if (this.config.getOnly && method.toLowerCase() !== "get") return false;
    return true;
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}
