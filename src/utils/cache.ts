import type { CacheConfig, ResponseFormat } from "../types/driver";
import { buildRequestKey } from "./request-key";

interface CacheEntry {
  data: ResponseFormat;
  expiry: number;
}

const DEFAULT_MAX_SIZE = 1000;

export class ResponseCache {
  private store = new Map<string, CacheEntry>();
  private config: Required<CacheConfig>;
  private maxSize: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: CacheConfig) {
    this.config = {
      enabled: config?.enabled ?? false,
      ttl: config?.ttl ?? 30000,
      getOnly: config?.getOnly ?? true,
    };
    this.maxSize = DEFAULT_MAX_SIZE;

    // Periodic cleanup of expired entries every TTL interval
    if (this.config.enabled) {
      this.cleanupTimer = setInterval(() => this.evictExpired(), this.config.ttl);
      // Allow the process to exit even if the timer is still running
      if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
        (this.cleanupTimer as NodeJS.Timeout).unref();
      }
    }
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  buildKey(method: string, url: string, payload?: Record<string, unknown>): string {
    return buildRequestKey(method, url, payload);
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
    // Evict oldest entries if cache is full
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
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

  /** Remove all expired entries */
  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiry) {
        this.store.delete(key);
      }
    }
  }

  /** Stop the periodic cleanup timer */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.store.clear();
  }
}
