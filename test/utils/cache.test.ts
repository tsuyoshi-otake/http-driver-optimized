import { ResponseCache } from "../../src/utils/cache";
import type { ResponseFormat } from "../../src/types/driver";

const mockResponse: ResponseFormat = { ok: true, status: 200, data: { id: 1 }, problem: null, originalError: null, duration: 10 };

describe("ResponseCache", () => {
  test("disabled by default", () => {
    const cache = new ResponseCache();
    expect(cache.enabled).toBe(false);
    expect(cache.shouldCache("get")).toBe(false);
  });

  test("enabled via config", () => {
    const cache = new ResponseCache({ enabled: true });
    expect(cache.enabled).toBe(true);
    expect(cache.shouldCache("get")).toBe(true);
  });

  test("getOnly=true only caches GET", () => {
    const cache = new ResponseCache({ enabled: true, getOnly: true });
    expect(cache.shouldCache("get")).toBe(true);
    expect(cache.shouldCache("post")).toBe(false);
  });

  test("getOnly=false caches all methods", () => {
    const cache = new ResponseCache({ enabled: true, getOnly: false });
    expect(cache.shouldCache("post")).toBe(true);
  });

  test("set and get returns cached data", () => {
    const cache = new ResponseCache({ enabled: true, ttl: 5000 });
    const key = cache.buildKey("get", "/api/users");
    cache.set(key, mockResponse);
    expect(cache.get(key)).toEqual(mockResponse);
    expect(cache.size()).toBe(1);
  });

  test("returns null for missing key", () => {
    const cache = new ResponseCache({ enabled: true });
    expect(cache.get("nonexistent")).toBeNull();
  });

  test("returns null for expired entry", async () => {
    const cache = new ResponseCache({ enabled: true, ttl: 1 });
    const key = cache.buildKey("get", "/api/users");
    cache.set(key, mockResponse);
    await new Promise((r) => setTimeout(r, 10));
    expect(cache.get(key)).toBeNull();
  });

  test("returns null and deletes expired entry by directly setting past expiry", () => {
    const cache = new ResponseCache({ enabled: true, ttl: 60000 });
    const key = cache.buildKey("get", "/api/expired");
    cache.set(key, mockResponse);
    // Directly manipulate the store to set expiry in the past
    const store = (cache as any).store as Map<string, { data: any; expiry: number }>;
    const entry = store.get(key)!;
    store.set(key, { ...entry, expiry: Date.now() - 1000 });
    // Now get() should detect expiry, delete, and return null
    expect(cache.get(key)).toBeNull();
    expect(cache.size()).toBe(0);
  });

  test("buildKey includes payload", () => {
    const cache = new ResponseCache({ enabled: true });
    const k1 = cache.buildKey("get", "/api", { page: 1 });
    const k2 = cache.buildKey("get", "/api", { page: 2 });
    const k3 = cache.buildKey("get", "/api");
    expect(k1).not.toBe(k2);
    expect(k3).not.toBe(k1);
  });

  test("clear removes all entries", () => {
    const cache = new ResponseCache({ enabled: true });
    cache.set("a", mockResponse);
    cache.set("b", mockResponse);
    expect(cache.size()).toBe(2);
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  test("evicts oldest entry when cache is full", () => {
    const cache = new ResponseCache({ enabled: true, ttl: 5000 });
    // Fill cache to max size (1000) by accessing private maxSize
    (cache as any).maxSize = 3;
    cache.set("key1", mockResponse);
    cache.set("key2", mockResponse);
    cache.set("key3", mockResponse);
    expect(cache.size()).toBe(3);
    // Adding a 4th entry should evict the oldest (key1)
    cache.set("key4", mockResponse);
    expect(cache.size()).toBe(3);
    expect(cache.get("key1")).toBeNull();
    expect(cache.get("key4")).toEqual(mockResponse);
  });

  test("updating existing key does not evict when at max size", () => {
    const cache = new ResponseCache({ enabled: true, ttl: 5000 });
    (cache as any).maxSize = 2;
    cache.set("key1", mockResponse);
    cache.set("key2", mockResponse);
    // Updating key1 should not evict anything
    cache.set("key1", { ...mockResponse, status: 201 });
    expect(cache.size()).toBe(2);
    expect(cache.get("key1")?.status).toBe(201);
  });

  test("evictExpired removes expired entries on periodic cleanup", async () => {
    const cache = new ResponseCache({ enabled: true, ttl: 10 });
    cache.set("expiring", mockResponse);
    expect(cache.size()).toBe(1);
    // Wait for entry to expire
    await new Promise((r) => setTimeout(r, 20));
    // Manually trigger eviction (simulating the interval)
    (cache as any).evictExpired();
    expect(cache.size()).toBe(0);
    cache.destroy();
  });

  test("destroy clears timer and store", () => {
    const cache = new ResponseCache({ enabled: true, ttl: 5000 });
    cache.set("key", mockResponse);
    expect(cache.size()).toBe(1);
    cache.destroy();
    expect(cache.size()).toBe(0);
    expect((cache as any).cleanupTimer).toBeNull();
  });

  test("destroy is safe to call when cache is disabled (no timer)", () => {
    const cache = new ResponseCache({ enabled: false });
    expect(() => cache.destroy()).not.toThrow();
    expect((cache as any).cleanupTimer).toBeNull();
  });
});
