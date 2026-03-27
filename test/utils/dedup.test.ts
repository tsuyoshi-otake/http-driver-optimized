import { RequestDedup } from "../../src/utils/dedup";
import type { ResponseFormat } from "../../src/types/driver";

const mockResponse: ResponseFormat = { ok: true, status: 200, data: "ok", problem: null, originalError: null, duration: 10 };

describe("RequestDedup", () => {
  test("executes function and returns result", async () => {
    const dedup = new RequestDedup();
    const fn = jest.fn().mockResolvedValue(mockResponse);
    const result = await dedup.execute("key1", fn);
    expect(result).toEqual(mockResponse);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("deduplicates concurrent requests with same key", async () => {
    const dedup = new RequestDedup();
    let resolvePromise: (v: ResponseFormat) => void;
    const fn = jest.fn().mockImplementation(() => new Promise((r) => { resolvePromise = r; }));

    const p1 = dedup.execute("key1", fn);
    const p2 = dedup.execute("key1", fn);

    expect(dedup.pendingCount).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1); // Only called once

    resolvePromise!(mockResponse);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(mockResponse);
    expect(r2).toEqual(mockResponse);
    expect(dedup.pendingCount).toBe(0);
  });

  test("different keys execute independently", async () => {
    const dedup = new RequestDedup();
    const fn1 = jest.fn().mockResolvedValue(mockResponse);
    const fn2 = jest.fn().mockResolvedValue({ ...mockResponse, data: "other" });

    const [r1, r2] = await Promise.all([
      dedup.execute("key1", fn1),
      dedup.execute("key2", fn2),
    ]);
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(r1.data).toBe("ok");
    expect(r2.data).toBe("other");
  });

  test("cleans up after promise resolves", async () => {
    const dedup = new RequestDedup();
    await dedup.execute("key1", async () => mockResponse);
    expect(dedup.pendingCount).toBe(0);
    // Second call with same key should execute again
    const fn = jest.fn().mockResolvedValue(mockResponse);
    await dedup.execute("key1", fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("buildKey generates unique keys", () => {
    const dedup = new RequestDedup();
    expect(dedup.buildKey("get", "/api")).toBe("get:/api:");
    expect(dedup.buildKey("get", "/api", { page: 1 })).toBe('get:/api:{"page":1}');
    expect(dedup.buildKey("post", "/api")).toBe("post:/api:");
  });
});
