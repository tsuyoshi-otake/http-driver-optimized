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
});
