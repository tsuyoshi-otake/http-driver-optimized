import { DriverBuilder, MethodAPI } from "../../src/index";
import type { ServiceApi } from "../../src/types/driver";

const svcNDJSON: ServiceApi = { id: "data.stream", url: "api/data", method: MethodAPI.get };
const svcNDJSONPost: ServiceApi = { id: "data.query", url: "api/query", method: MethodAPI.post };

function buildDriver(services: ServiceApi[] = [svcNDJSON, svcNDJSONPost]) {
  return new DriverBuilder().withBaseURL("http://example.com").withServices(services).build();
}

function createNDJSONResponse(lines: string[], status = 200, ok = true): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < lines.length) controller.enqueue(encoder.encode(lines[index++]));
      else controller.close();
    },
  });
  return { ok, status, statusText: ok ? "OK" : "Error", headers: new Headers({ "Content-Type": "application/x-ndjson" }), body } as unknown as Response;
}

describe("execServiceByNDJSON", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; jest.clearAllMocks(); });

  test("streams NDJSON objects from GET endpoint", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(createNDJSONResponse(['{"id":1}\n', '{"id":2}\n']));
    const result = await buildDriver().execServiceByNDJSON<{ id: number }>({ id: "data.stream" });
    expect(result.ok).toBe(true);
    const items = [];
    for await (const item of result.stream) items.push(item);
    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test("streams NDJSON from POST endpoint", async () => {
    let capturedOpts: any;
    globalThis.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedOpts = opts;
      return Promise.resolve(createNDJSONResponse(['{"ok":true}\n']));
    });
    const result = await buildDriver().execServiceByNDJSON({ id: "data.query" }, { filter: "active" });
    expect(result.ok).toBe(true);
    expect(capturedOpts.method).toBe("POST");
    expect(capturedOpts.body).toBe(JSON.stringify({ filter: "active" }));
  });

  test("returns error for unknown service", async () => {
    const result = await buildDriver().execServiceByNDJSON({ id: "nonexistent" });
    expect(result.ok).toBe(false);
    expect(result.problem).toContain("not found");
    const items = [];
    for await (const item of result.stream) items.push(item);
    expect(items).toHaveLength(0);
  });

  test("returns error for non-ok response", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(createNDJSONResponse([], 500, false));
    const result = await buildDriver().execServiceByNDJSON({ id: "data.stream" });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
  });

  test("returns error when no body", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(), body: null });
    const result = await buildDriver().execServiceByNDJSON({ id: "data.stream" });
    expect(result.ok).toBe(false);
    expect(result.problem).toContain("No readable stream");
  });

  test("handles fetch error", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error("Network down"));
    const result = await buildDriver().execServiceByNDJSON({ id: "data.stream" });
    expect(result.ok).toBe(false);
    expect(result.problem).toBe("Network down");
  });

  test("abort stops the stream", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(createNDJSONResponse(['{"n":1}\n', '{"n":2}\n']));
    const result = await buildDriver().execServiceByNDJSON({ id: "data.stream" });
    expect(typeof result.abort).toBe("function");
    result.abort();
  });

  test("sets Accept: application/x-ndjson header", async () => {
    let capturedOpts: any;
    globalThis.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedOpts = opts;
      return Promise.resolve(createNDJSONResponse(['{"ok":true}\n']));
    });
    await buildDriver().execServiceByNDJSON({ id: "data.stream" });
    expect(capturedOpts.headers.Accept).toBe("application/x-ndjson");
  });

  test("handles non-Error thrown value", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue("string error");
    const result = await buildDriver().execServiceByNDJSON({ id: "data.stream" });
    expect(result.problem).toBe("string error");
  });

  test("returns 'Request failed' when statusText is empty", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, statusText: "", headers: new Headers(), body: null });
    const result = await buildDriver().execServiceByNDJSON({ id: "data.stream" });
    expect(result.problem).toBe("Request failed");
  });

  test("service not found abort is callable", async () => {
    const result = await buildDriver().execServiceByNDJSON({ id: "nonexistent" });
    expect(() => result.abort()).not.toThrow();
  });

  test("error path abort is callable", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error("fail"));
    const result = await buildDriver().execServiceByNDJSON({ id: "data.stream" });
    expect(() => result.abort()).not.toThrow();
  });

  test("non-ok abort is callable", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403, statusText: "Forbidden", headers: new Headers(), body: null });
    const result = await buildDriver().execServiceByNDJSON({ id: "data.stream" });
    expect(() => result.abort()).not.toThrow();
  });

  test("no-body abort is callable", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(), body: null });
    const result = await buildDriver().execServiceByNDJSON({ id: "data.stream" });
    expect(() => result.abort()).not.toThrow();
  });
});

  test("POST with Content-Type already set in options", async () => {
    let capturedOpts: any;
    globalThis.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedOpts = opts;
      return Promise.resolve(createNDJSONResponse(['{"ok":true}\n']));
    });
    await buildDriver().execServiceByNDJSON(
      { id: "data.query" }, { q: "test" },
      { headers: { "Content-Type": "text/plain", "Accept": "text/plain" } }
    );
    expect(capturedOpts.headers["Content-Type"]).toBe("text/plain");
    expect(capturedOpts.headers.Accept).toBe("text/plain");
  });

  test("applies request transform", async () => {
    let capturedUrl = "";
    globalThis.fetch = jest.fn().mockImplementation((url) => {
      capturedUrl = url;
      return Promise.resolve(createNDJSONResponse(['{"ok":true}\n']));
    });
    const driver = new DriverBuilder()
      .withBaseURL("http://example.com")
      .withServices([svcNDJSON])
      .withAddRequestTransformFetch((url, opts) => ({ url: url + "?t=1", requestOptions: opts }))
      .build();
    await driver.execServiceByNDJSON({ id: "data.stream" });
    expect(capturedUrl).toContain("?t=1");
  });

  test("chains existing abort signal", async () => {
    const ext = new AbortController();
    globalThis.fetch = jest.fn().mockResolvedValue(createNDJSONResponse(['{"ok":true}\n']));
    const result = await buildDriver().execServiceByNDJSON(
      { id: "data.stream" }, null, { signal: ext.signal }
    );
    expect(result.ok).toBe(true);
    ext.abort();
  });

  test("applies per-service timeout", async () => {
    const svcTimeout: ServiceApi = { id: "slow.ndjson", url: "api/slow", method: MethodAPI.get, timeout: 100 };
    let capturedOpts: any;
    globalThis.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedOpts = opts;
      return Promise.resolve(createNDJSONResponse(['{"ok":true}\n']));
    });
    const driver = new DriverBuilder().withBaseURL("http://example.com").withServices([svcTimeout]).build();
    await driver.execServiceByNDJSON({ id: "slow.ndjson" });
    expect(capturedOpts.signal).toBeDefined();
  });

  test("emits onRequest hook", async () => {
    const onRequest = jest.fn();
    globalThis.fetch = jest.fn().mockResolvedValue(createNDJSONResponse(['{"ok":true}\n']));
    const driver = new DriverBuilder()
      .withBaseURL("http://example.com")
      .withServices([svcNDJSON])
      .onRequest(onRequest)
      .build();
    await driver.execServiceByNDJSON({ id: "data.stream" });
    expect(onRequest).toHaveBeenCalled();
  });

  test("applies abortController from options", async () => {
    let capturedOpts: any;
    globalThis.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedOpts = opts;
      return Promise.resolve(createNDJSONResponse(['{"ok":true}\n']));
    });
    await buildDriver().execServiceByNDJSON(
      { id: "data.stream" }, null,
      { abortController: { signal: new AbortController().signal } }
    );
    expect(capturedOpts.signal).toBeDefined();
  });

  test("iterating empty stream from service-not-found returns no items", async () => {
    const result = await buildDriver().execServiceByNDJSON({ id: "nonexistent" });
    const items = [];
    for await (const item of result.stream) items.push(item);
    expect(items).toHaveLength(0);
  });

  test("iterating empty stream from error returns no items", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error("fail"));
    const result = await buildDriver().execServiceByNDJSON({ id: "data.stream" });
    const items = [];
    for await (const item of result.stream) items.push(item);
    expect(items).toHaveLength(0);
  });

  test("iterating empty stream from non-ok returns no items", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, statusText: "ISE", headers: new Headers(), body: null });
    const result = await buildDriver().execServiceByNDJSON({ id: "data.stream" });
    const items = [];
    for await (const item of result.stream) items.push(item);
    expect(items).toHaveLength(0);
  });

  test("iterating empty stream from no-body returns no items", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(), body: null });
    const result = await buildDriver().execServiceByNDJSON({ id: "data.stream" });
    const items = [];
    for await (const item of result.stream) items.push(item);
    expect(items).toHaveLength(0);
  });

  test("uses abortController.signal from service-level options when no signal set", async () => {
    const abortController = new AbortController();
    const svcWithAbortCtrl: ServiceApi = {
      id: "svc.abort.ndjson", url: "api/abort", method: MethodAPI.get,
      options: { abortController },
    };
    let capturedOpts: any;
    globalThis.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedOpts = opts;
      return Promise.resolve(createNDJSONResponse(['{"ok":true}\n']));
    });
    const driver = new DriverBuilder()
      .withBaseURL("http://example.com")
      .withServices([svcWithAbortCtrl])
      .build();
    await driver.execServiceByNDJSON({ id: "svc.abort.ndjson" });
    expect(capturedOpts.signal).toBeDefined();
  });

  test("skips abortController when signal already set by timeout in NDJSON", async () => {
    const abortController = new AbortController();
    let capturedOpts: any;
    globalThis.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedOpts = opts;
      return Promise.resolve(createNDJSONResponse(['{"ok":true}\n']));
    });
    const driver = new DriverBuilder()
      .withBaseURL("http://example.com")
      .withServices([svcNDJSON])
      .withTimeout(5000)
      .build();
    await driver.execServiceByNDJSON({ id: "data.stream" }, null, { abortController });
    expect(capturedOpts.signal).toBeDefined();
    expect(capturedOpts.signal).not.toBe(abortController.signal);
  });
