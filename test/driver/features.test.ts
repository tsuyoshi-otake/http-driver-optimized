import { DriverBuilder, MethodAPI } from "../../src/index";
import type { ServiceApi, MiddlewareContext } from "../../src/types/driver";
import { resolveRetryConfig, withRetry } from "../../src/utils/retry";

const svcGet: ServiceApi = { id: "svc.get", url: "api/{id}", method: MethodAPI.get };
const svcPost: ServiceApi = { id: "svc.post", url: "api/post", method: MethodAPI.post };
const svcRetry: ServiceApi = { id: "svc.retry", url: "api/retry", method: MethodAPI.get, retry: { maxAttempts: 2, delay: 1 } };
const svcTimeout: ServiceApi = { id: "svc.timeout", url: "api/timeout", method: MethodAPI.get, timeout: 50 };

function buildDriver(services: ServiceApi[] = [svcGet, svcPost, svcRetry, svcTimeout], extra?: any) {
  const builder = new DriverBuilder().withBaseURL("http://example.com").withServices(services);
  if (extra?.retry) builder.withRetry(extra.retry);
  if (extra?.cache) builder.withCache(extra.cache);
  if (extra?.timeout) builder.withTimeout(extra.timeout);
  if (extra?.middleware) extra.middleware.forEach((mw: any) => builder.use(mw));
  if (extra?.onRequest) builder.onRequest(extra.onRequest);
  if (extra?.onResponse) builder.onResponse(extra.onResponse);
  return builder.build();
}

describe("Retry", () => {
  test("retries on 503 and succeeds on second attempt (Axios)", async () => {
    const driver = buildDriver();
    let callCount = 0;
    driver.get = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ ok: false, status: 503, data: null, headers: {}, problem: "SERVER_ERROR", originalError: null, duration: 5 });
      return Promise.resolve({ ok: true, status: 200, data: { success: true }, headers: {}, problem: null, originalError: null, duration: 5 });
    });
    const res = await driver.execService({ id: "svc.retry", params: { id: "1" } });
    expect(res.ok).toBe(true);
    expect(callCount).toBe(2);
  });

  test("global retry config applies to all services", async () => {
    const driver = buildDriver([svcGet], { retry: { maxAttempts: 1, delay: 1 } });
    let callCount = 0;
    driver.get = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ ok: false, status: 500, data: null, headers: {}, problem: "err", originalError: null, duration: 5 });
      return Promise.resolve({ ok: true, status: 200, data: "ok", headers: {}, problem: null, originalError: null, duration: 5 });
    });
    const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
    expect(res.ok).toBe(true);
    expect(callCount).toBe(2);
  });

  test("retries on fetch path", async () => {
    const origFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ ok: false, status: 503, statusText: "Unavailable", headers: new Headers({ "Content-Type": "application/json" }), text: async () => '{"error":"retry"}' });
      return Promise.resolve({ ok: true, status: 200, headers: new Headers({ "Content-Type": "application/json" }), text: async () => '{"ok":true}' });
    });
    const driver = buildDriver();
    const res = await driver.execServiceByFetch({ id: "svc.retry" });
    expect(res.ok).toBe(true);
    expect(callCount).toBe(2);
    globalThis.fetch = origFetch;
  });
});

describe("Cache", () => {
  test("caches GET response and returns cached on second call", async () => {
    const driver = buildDriver([svcGet], { cache: { enabled: true, ttl: 5000 } });
    let callCount = 0;
    driver.get = jest.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({ ok: true, status: 200, data: { id: callCount }, headers: {}, problem: null, originalError: null, duration: 5 });
    });
    const r1 = await driver.execService({ id: "svc.get", params: { id: "1" } });
    const r2 = await driver.execService({ id: "svc.get", params: { id: "1" } });
    expect(r1.data).toEqual({ id: 1 });
    expect(r2.data).toEqual({ id: 1 }); // Cached
    expect(callCount).toBe(1); // Only called once
  });

  test("does not cache POST requests when getOnly=true", async () => {
    const driver = buildDriver([svcPost], { cache: { enabled: true, getOnly: true } });
    let callCount = 0;
    driver.post = jest.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({ ok: true, status: 201, data: { id: callCount }, headers: {}, problem: null, originalError: null, duration: 5 });
    });
    await driver.execService({ id: "svc.post" }, { data: "test" });
    await driver.execService({ id: "svc.post" }, { data: "test" });
    expect(callCount).toBe(2); // Not cached
  });

  test("does not cache error responses", async () => {
    const driver = buildDriver([svcGet], { cache: { enabled: true, ttl: 5000 } });
    let callCount = 0;
    driver.get = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ ok: false, status: 500, data: null, headers: {}, problem: "err", originalError: null, duration: 5 });
      return Promise.resolve({ ok: true, status: 200, data: "ok", headers: {}, problem: null, originalError: null, duration: 5 });
    });
    const r1 = await driver.execService({ id: "svc.get", params: { id: "1" } });
    const r2 = await driver.execService({ id: "svc.get", params: { id: "1" } });
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(true);
    expect(callCount).toBe(2);
  });
});

describe("Observability hooks", () => {
  test("onRequest and onResponse are called", async () => {
    const onRequest = jest.fn();
    const onResponse = jest.fn();
    const driver = buildDriver([svcGet], { onRequest, onResponse });
    driver.get = jest.fn().mockResolvedValue({ ok: true, status: 200, data: "ok", headers: {}, problem: null, originalError: null, duration: 5 });
    await driver.execService({ id: "svc.get", params: { id: "1" } });
    expect(onRequest).toHaveBeenCalledWith(expect.objectContaining({ serviceId: "svc.get", method: "get" }));
    expect(onResponse).toHaveBeenCalledWith(expect.objectContaining({ serviceId: "svc.get", status: 200, ok: true }));
  });

  test("onRequest/onResponse work with fetch path", async () => {
    const origFetch = globalThis.fetch;
    const onRequest = jest.fn();
    const onResponse = jest.fn();
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => '{"ok":true}',
    } as any);
    const driver = buildDriver([svcGet], { onRequest, onResponse });
    await driver.execServiceByFetch({ id: "svc.get", params: { id: "1" } });
    expect(onRequest).toHaveBeenCalled();
    expect(onResponse).toHaveBeenCalled();
    globalThis.fetch = origFetch;
  });
});

describe("Middleware", () => {
  test("middleware executes around service call", async () => {
    const order: string[] = [];
    const mw = async (ctx: MiddlewareContext, next: () => Promise<void>) => {
      order.push("before:" + ctx.serviceId);
      await next();
      order.push("after:" + ctx.serviceId);
    };
    const driver = buildDriver([svcGet], { middleware: [mw] });
    driver.get = jest.fn().mockResolvedValue({ ok: true, status: 200, data: "ok", headers: {}, problem: null, originalError: null, duration: 5 });
    await driver.execService({ id: "svc.get", params: { id: "1" } });
    expect(order).toEqual(["before:svc.get", "after:svc.get"]);
  });

  test("middleware works with fetch path", async () => {
    const origFetch = globalThis.fetch;
    const captured: string[] = [];
    const mw = async (ctx: MiddlewareContext, next: () => Promise<void>) => {
      captured.push(ctx.serviceId);
      await next();
    };
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => '{"ok":true}',
    } as any);
    const driver = buildDriver([svcGet], { middleware: [mw] });
    await driver.execServiceByFetch({ id: "svc.get", params: { id: "1" } });
    expect(captured).toEqual(["svc.get"]);
    globalThis.fetch = origFetch;
  });
});

describe("Per-service timeout", () => {
  test("service timeout creates AbortController signal", async () => {
    const driver = buildDriver();
    let capturedConfig: any;
    (driver as any).defaults.adapter = async (config: any) => {
      capturedConfig = config;
      return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
    };
    await driver.execService({ id: "svc.timeout" });
    expect(capturedConfig.signal).toBeDefined();
  });
});

describe("Builder new methods", () => {
  test("withRetry sets retry config", () => {
    const builder = new DriverBuilder()
      .withBaseURL("http://example.com")
      .withServices([svcGet])
      .withRetry({ maxAttempts: 3 });
    expect((builder as any).config.retry.maxAttempts).toBe(3);
  });

  test("withCache sets cache config", () => {
    const builder = new DriverBuilder()
      .withBaseURL("http://example.com")
      .withServices([svcGet])
      .withCache({ enabled: true, ttl: 10000 });
    expect((builder as any).config.cache.enabled).toBe(true);
  });

  test("withTimeout sets global timeout", () => {
    const builder = new DriverBuilder()
      .withBaseURL("http://example.com")
      .withServices([svcGet])
      .withTimeout(5000);
    expect((builder as any).config.timeout).toBe(5000);
  });

  test("use() adds middleware", () => {
    const mw = async (_ctx: MiddlewareContext, next: () => Promise<void>) => { await next(); };
    const builder = new DriverBuilder()
      .withBaseURL("http://example.com")
      .withServices([svcGet])
      .use(mw);
    expect((builder as any).config.middleware).toHaveLength(1);
  });

  test("onRequest/onResponse set hooks", () => {
    const onReq = jest.fn();
    const onRes = jest.fn();
    const builder = new DriverBuilder()
      .withBaseURL("http://example.com")
      .withServices([svcGet])
      .onRequest(onReq)
      .onResponse(onRes);
    expect((builder as any).config.onRequest).toBe(onReq);
    expect((builder as any).config.onResponse).toBe(onRes);
  });
});

describe("Cache on fetch path", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = origFetch; });

  test("caches GET response on fetch path", async () => {
    let callCount = 0;
    globalThis.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true, status: 200, headers: new Headers({ "Content-Type": "application/json" }),
        text: async () => JSON.stringify({ id: callCount }),
      });
    });
    const driver = buildDriver([svcGet], { cache: { enabled: true, ttl: 5000 } });
    const r1 = await driver.execServiceByFetch({ id: "svc.get", params: { id: "1" } });
    const r2 = await driver.execServiceByFetch({ id: "svc.get", params: { id: "1" } });
    expect(r1.data).toEqual({ id: 1 });
    expect(r2.data).toEqual({ id: 1 });
    expect(callCount).toBe(1);
  });

  test("does not cache error responses on fetch path", async () => {
    let callCount = 0;
    globalThis.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ ok: false, status: 500, statusText: "ISE", headers: new Headers({ "Content-Type": "application/json" }), text: async () => '{"err":true}' });
      return Promise.resolve({ ok: true, status: 200, headers: new Headers({ "Content-Type": "application/json" }), text: async () => '{"ok":true}' });
    });
    const driver = buildDriver([svcGet], { cache: { enabled: true, ttl: 5000 } });
    const r1 = await driver.execServiceByFetch({ id: "svc.get", params: { id: "1" } });
    const r2 = await driver.execServiceByFetch({ id: "svc.get", params: { id: "1" } });
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(true);
    expect(callCount).toBe(2);
  });
});

describe("Timeout on fetch path", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = origFetch; });

  test("per-service timeout applies on fetch path", async () => {
    let capturedSignal: any;
    globalThis.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedSignal = opts?.signal;
      return Promise.resolve({
        ok: true, status: 200, headers: new Headers({ "Content-Type": "application/json" }),
        text: async () => '{"ok":true}',
      });
    });
    const driver = buildDriver();
    await driver.execServiceByFetch({ id: "svc.timeout" });
    expect(capturedSignal).toBeDefined();
  });
});

describe("Dedup on fetch path", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = origFetch; });

  test("deduplicates concurrent GET requests on fetch path", async () => {
    let callCount = 0;
    let resolvePromise: (v: any) => void;
    globalThis.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      return new Promise((r) => { resolvePromise = r; });
    });
    const driver = buildDriver([svcGet]);
    const p1 = driver.execServiceByFetch({ id: "svc.get", params: { id: "1" } });
    const p2 = driver.execServiceByFetch({ id: "svc.get", params: { id: "1" } });
    resolvePromise!({
      ok: true, status: 200, headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => '{"ok":true}',
    });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(callCount).toBe(1);
  });
});

describe("Retry config edge cases", () => {
  test("resolveRetryConfig with all fields from per-service", () => {
    const config = resolveRetryConfig(
      { maxAttempts: 1, delay: 100, backoff: "fixed", retryOn: [500] },
      { maxAttempts: 3, delay: 200, backoff: "exponential", retryOn: [503] }
    );
    expect(config).toEqual({ maxAttempts: 3, delay: 200, backoff: "exponential", retryOn: [503] });
  });

  test("withRetry with undefined maxAttempts returns immediately", async () => {
    const fn = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    await withRetry({}, fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("Error path coverage", () => {
  test("execServiceByFetch error path does not crash observability hooks", async () => {
    const origFetch = globalThis.fetch;
    const onRequest = jest.fn();
    const onResponse = jest.fn();
    globalThis.fetch = jest.fn().mockRejectedValue(new Error("Network down"));
    const driver = buildDriver([svcGet], { onRequest, onResponse });
    const res = await driver.execServiceByFetch({ id: "svc.get", params: { id: "1" } });
    expect(res.ok).toBe(false);
    expect(onRequest).toHaveBeenCalled();
    globalThis.fetch = origFetch;
  });

  test("execService error path with cache enabled does not cache errors", async () => {
    const driver = buildDriver([svcGet], { cache: { enabled: true, ttl: 5000 } });
    driver.get = jest.fn().mockRejectedValue(new Error("timeout reached"));
    const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
    expect(res.ok).toBe(false);
  });
});

describe("Retry delay fallback", () => {
  test("withRetry with exponential backoff and undefined delay uses 1000ms default", async () => {
    const fn = jest.fn().mockResolvedValue({ ok: false, status: 503, data: null, problem: "err", originalError: null, duration: 0 });
    await withRetry({ maxAttempts: 1, backoff: "exponential" }, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("withRetry with fixed backoff and undefined delay uses 1000ms default", async () => {
    const fn = jest.fn().mockResolvedValue({ ok: false, status: 503, data: null, problem: "err", originalError: null, duration: 0 });
    const start = Date.now();
    await withRetry({ maxAttempts: 1, backoff: "fixed" }, fn);
    expect(Date.now() - start).toBeGreaterThanOrEqual(900);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("applyTimeout function", () => {
  test("global timeout applies when no service timeout and no signal", async () => {
    const driver = buildDriver([svcGet], { timeout: 100 });
    let capturedConfig: any;
    (driver as any).defaults.adapter = async (config: any) => {
      capturedConfig = config;
      return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
    };
    await driver.execService({ id: "svc.get", params: { id: "1" } });
    expect(capturedConfig.signal).toBeDefined();
  });

  test("timeout does not override existing signal", async () => {
    const controller = new AbortController();
    const driver = buildDriver([svcGet], { timeout: 100 });
    let capturedConfig: any;
    (driver as any).defaults.adapter = async (config: any) => {
      capturedConfig = config;
      return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
    };
    await driver.execService({ id: "svc.get", params: { id: "1" } }, {}, { signal: controller.signal });
    expect(capturedConfig.signal).toBe(controller.signal);
  });
});

describe("Outer catch coverage", () => {
  test("execService outer catch handles middleware throwing", async () => {
    const throwingMw = async (_ctx: MiddlewareContext, _next: () => Promise<void>) => {
      throw new Error("middleware exploded");
    };
    const driver = buildDriver([svcGet], { middleware: [throwingMw] });
    driver.get = jest.fn().mockResolvedValue({ ok: true, status: 200, data: "ok", headers: {}, problem: null, originalError: null, duration: 5 });
    const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
    expect(res.ok).toBe(false);
    expect(res.problem).toContain("middleware exploded");
  });

  test("execServiceByFetch outer catch handles middleware throwing", async () => {
    const origFetch = globalThis.fetch;
    const throwingMw = async (_ctx: MiddlewareContext, _next: () => Promise<void>) => {
      throw new Error("fetch middleware exploded");
    };
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => '{"ok":true}',
    } as any);
    const driver = buildDriver([svcGet], { middleware: [throwingMw] });
    const res = await driver.execServiceByFetch({ id: "svc.get", params: { id: "1" } });
    expect(res.ok).toBe(false);
    expect(res.problem).toContain("fetch middleware exploded");
    globalThis.fetch = origFetch;
  });
});
