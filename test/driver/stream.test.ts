import { DriverBuilder, MethodAPI } from "../../src/index";
import type { ServiceApi } from "../../src/types/driver";

const svcStream: ServiceApi = { id: "chat.stream", url: "api/chat", method: MethodAPI.post };
const svcStreamGet: ServiceApi = { id: "events.stream", url: "api/events", method: MethodAPI.get };

function buildDriver(services: ServiceApi[] = [svcStream, svcStreamGet]) {
  return new DriverBuilder().withBaseURL("http://example.com").withServices(services).build();
}

function createSSEResponse(chunks: string[], status = 200, ok = true): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index++]));
      } else {
        controller.close();
      }
    },
  });

  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    headers: new Headers({ "Content-Type": "text/event-stream" }),
    body,
  } as unknown as Response;
}

describe("execServiceByStream", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; jest.clearAllMocks(); });

  test("streams SSE events from POST endpoint", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      createSSEResponse(["data: hello\n\n", "data: world\n\n"])
    );

    const driver = buildDriver();
    const result = await driver.execServiceByStream(
      { id: "chat.stream" },
      { message: "hi" }
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);

    const events = [];
    for await (const event of result.stream) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0].data).toBe("hello");
    expect(events[1].data).toBe("world");
  });

  test("streams SSE events from GET endpoint", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      createSSEResponse(["data: event1\n\n", "data: event2\n\n"])
    );

    const driver = buildDriver();
    const result = await driver.execServiceByStream({ id: "events.stream" });

    expect(result.ok).toBe(true);
    const events = [];
    for await (const event of result.stream) {
      events.push(event);
    }
    expect(events).toHaveLength(2);
  });

  test("returns error for unknown service", async () => {
    const driver = buildDriver();
    const result = await driver.execServiceByStream({ id: "nonexistent" });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.problem).toContain("not found");

    // Stream should be empty
    const events = [];
    for await (const event of result.stream) {
      events.push(event);
    }
    expect(events).toHaveLength(0);
  });

  test("returns error for non-ok response", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      createSSEResponse([], 401, false)
    );

    const driver = buildDriver();
    const result = await driver.execServiceByStream({ id: "chat.stream" }, { message: "hi" });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  test("returns error when response has no body", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, statusText: "OK",
      headers: new Headers({ "Content-Type": "text/event-stream" }),
      body: null,
    });

    const driver = buildDriver();
    const result = await driver.execServiceByStream({ id: "chat.stream" });

    expect(result.ok).toBe(false);
    expect(result.problem).toContain("No readable stream");
  });

  test("handles fetch error", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error("Network down"));

    const driver = buildDriver();
    const result = await driver.execServiceByStream({ id: "chat.stream" });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect(result.problem).toBe("Network down");
  });

  test("abort() stops the stream", async () => {
    let controllerRef: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controllerRef = controller; },
      pull(controller) {
        controller.enqueue(new TextEncoder().encode("data: tick\n\n"));
      },
    });

    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, headers: new Headers({ "Content-Type": "text/event-stream" }),
      body,
    });

    const driver = buildDriver();
    const result = await driver.execServiceByStream({ id: "chat.stream" });

    expect(result.ok).toBe(true);
    expect(typeof result.abort).toBe("function");

    const events = [];
    for await (const event of result.stream) {
      events.push(event);
      if (events.length >= 2) {
        result.abort();
        break;
      }
    }
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  test("sets Accept: text/event-stream header", async () => {
    let capturedOptions: any;
    globalThis.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedOptions = opts;
      return Promise.resolve(createSSEResponse(["data: ok\n\n"]));
    });

    const driver = buildDriver();
    await driver.execServiceByStream({ id: "events.stream" });

    expect(capturedOptions.headers.Accept).toBe("text/event-stream");
  });

  test("POST sends JSON body", async () => {
    let capturedOptions: any;
    globalThis.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedOptions = opts;
      return Promise.resolve(createSSEResponse(["data: ok\n\n"]));
    });

    const driver = buildDriver();
    await driver.execServiceByStream({ id: "chat.stream" }, { prompt: "hello" });

    expect(capturedOptions.method).toBe("POST");
    expect(capturedOptions.body).toBe(JSON.stringify({ prompt: "hello" }));
  });

  test("applies per-service timeout", async () => {
    const svcWithTimeout: ServiceApi = { id: "slow.stream", url: "api/slow", method: MethodAPI.get, timeout: 100 };
    const driver = buildDriver([svcWithTimeout]);

    let capturedOptions: any;
    globalThis.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedOptions = opts;
      return Promise.resolve(createSSEResponse(["data: ok\n\n"]));
    });

    await driver.execServiceByStream({ id: "slow.stream" });
    expect(capturedOptions.signal).toBeDefined();
  });

  test("applies request transform", async () => {
    let capturedUrl: string = "";
    globalThis.fetch = jest.fn().mockImplementation((url, _opts) => {
      capturedUrl = url;
      return Promise.resolve(createSSEResponse(["data: ok\n\n"]));
    });

    const driver = new DriverBuilder()
      .withBaseURL("http://example.com")
      .withServices([svcStreamGet])
      .withAddRequestTransformFetch((url, opts) => ({
        url: url + "?token=abc",
        requestOptions: opts,
      }))
      .build();

    await driver.execServiceByStream({ id: "events.stream" });
    expect(capturedUrl).toContain("?token=abc");
  });

  test("handles non-Error thrown value", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue("string error");

    const driver = buildDriver();
    const result = await driver.execServiceByStream({ id: "chat.stream" });

    expect(result.ok).toBe(false);
    expect(result.problem).toBe("string error");
  });

  test("chains existing abort signal", async () => {
    const externalController = new AbortController();
    globalThis.fetch = jest.fn().mockResolvedValue(
      createSSEResponse(["data: ok\n\n"])
    );

    const driver = buildDriver();
    const result = await driver.execServiceByStream(
      { id: "events.stream" }, null,
      { signal: externalController.signal }
    );

    expect(result.ok).toBe(true);
    // External abort should propagate
    externalController.abort();
    // The internal controller should also be aborted now
  });
});

  test("emits onRequest hook", async () => {
    const onRequest = jest.fn();
    globalThis.fetch = jest.fn().mockResolvedValue(createSSEResponse(["data: ok\n\n"]));

    const driver = new DriverBuilder()
      .withBaseURL("http://example.com")
      .withServices([svcStreamGet])
      .onRequest(onRequest)
      .build();

    await driver.execServiceByStream({ id: "events.stream" });
    expect(onRequest).toHaveBeenCalledWith(expect.objectContaining({ serviceId: "events.stream" }));
  });

  test("applies abortController from options", async () => {
    let capturedOptions: any;
    globalThis.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedOptions = opts;
      return Promise.resolve(createSSEResponse(["data: ok\n\n"]));
    });

    const driver = buildDriver();
    await driver.execServiceByStream({ id: "events.stream" }, null, { abortController: { signal: new AbortController().signal } });
    expect(capturedOptions.signal).toBeDefined();
  });

  test("returns error with statusText for non-ok response", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 403, statusText: "Forbidden",
      headers: new Headers(), body: null,
    });

    const driver = buildDriver();
    const result = await driver.execServiceByStream({ id: "chat.stream" });
    expect(result.ok).toBe(false);
    expect(result.problem).toBe("Forbidden");
    // abort should be callable
    result.abort();
  });

  test("returns 'Request failed' when statusText is empty", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 500, statusText: "",
      headers: new Headers(), body: null,
    });

    const driver = buildDriver();
    const result = await driver.execServiceByStream({ id: "chat.stream" });
    expect(result.ok).toBe(false);
    expect(result.problem).toBe("Request failed");
  });

  test("stream with headers passed in call options", async () => {
    let capturedOptions: any;
    globalThis.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedOptions = opts;
      return Promise.resolve(createSSEResponse(["data: ok\n\n"]));
    });

    const driver = buildDriver();
    await driver.execServiceByStream(
      { id: "events.stream" }, null,
      { headers: { "Accept": "application/json" } }
    );
    // Call-level Accept should be preserved (not overwritten)
    expect(capturedOptions.headers.Accept).toBe("application/json");
  });

  test("POST stream without Content-Type in options gets default", async () => {
    let capturedOptions: any;
    globalThis.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedOptions = opts;
      return Promise.resolve(createSSEResponse(["data: ok\n\n"]));
    });

    const driver = buildDriver();
    await driver.execServiceByStream({ id: "chat.stream" }, { msg: "hi" });
    expect(capturedOptions.headers["Content-Type"]).toBe("application/json");
  });

  test("no-body abort function is callable", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, statusText: "OK",
      headers: new Headers(), body: null,
    });

    const driver = buildDriver();
    const result = await driver.execServiceByStream({ id: "chat.stream" });
    expect(result.ok).toBe(false);
    // abort should not throw
    expect(() => result.abort()).not.toThrow();
  });

  test("error path abort function is callable", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error("fail"));

    const driver = buildDriver();
    const result = await driver.execServiceByStream({ id: "chat.stream" });
    expect(result.ok).toBe(false);
    expect(() => result.abort()).not.toThrow();
  });

  test("service not found abort function is callable", async () => {
    const driver = buildDriver();
    const result = await driver.execServiceByStream({ id: "nonexistent" });
    expect(() => result.abort()).not.toThrow();
  });

  test("POST stream with Content-Type already set in call options", async () => {
    let capturedOptions: any;
    globalThis.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedOptions = opts;
      return Promise.resolve(createSSEResponse(["data: ok\n\n"]));
    });

    const driver = buildDriver();
    await driver.execServiceByStream(
      { id: "chat.stream" }, { msg: "hi" },
      { headers: { "Content-Type": "text/plain", "Accept": "text/event-stream" } }
    );
    // Should keep existing Content-Type
    expect(capturedOptions.headers["Content-Type"]).toBe("text/plain");
  });

  test("uses abortController.signal from service-level options when no signal set", async () => {
    const abortController = new AbortController();
    const svcWithAbortCtrl: ServiceApi = {
      id: "svc.abort", url: "api/abort", method: MethodAPI.get,
      options: { abortController },
    };
    let capturedOptions: any;
    globalThis.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedOptions = opts;
      return Promise.resolve(createSSEResponse(["data: ok\n\n"]));
    });
    const driver = new DriverBuilder()
      .withBaseURL("http://example.com")
      .withServices([svcWithAbortCtrl])
      .build();
    await driver.execServiceByStream({ id: "svc.abort" });
    expect(capturedOptions.signal).toBeDefined();
  });

  test("skips abortController when signal already set by timeout in stream", async () => {
    const abortController = new AbortController();
    let capturedOptions: any;
    globalThis.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedOptions = opts;
      return Promise.resolve(createSSEResponse(["data: ok\n\n"]));
    });
    const driver = new DriverBuilder()
      .withBaseURL("http://example.com")
      .withServices([svcStreamGet])
      .withTimeout(5000)
      .build();
    await driver.execServiceByStream({ id: "events.stream" }, null, { abortController });
    expect(capturedOptions.signal).toBeDefined();
    expect(capturedOptions.signal).not.toBe(abortController.signal);
  });
