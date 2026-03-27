import { DriverBuilder, MethodAPI } from "../../src/index";
import type { ServiceApi } from "../../src/types/driver";

const svcGet: ServiceApi = { id: "fetch.get", url: "api/fetch/{id}", method: MethodAPI.get, options: {} };
const svcPost: ServiceApi = { id: "fetch.post", url: "api/fetch", method: MethodAPI.post, options: { headers: { "Content-Type": "application/json" } } };

function buildDriver(services: ServiceApi[] = [svcGet, svcPost]) {
  return new DriverBuilder().withBaseURL("http://example.com").withServices(services).build();
}

describe("execServiceByFetch", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; jest.clearAllMocks(); });

  test("returns error when service not found", async () => {
    const res = await buildDriver().execServiceByFetch({ id: "nonexistent" });
    expect(res.ok).toBe(false);
    expect(res.problem).toBe("Service nonexistent in driver not found");
  });

  test("returns successful response for POST", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 201,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => JSON.stringify({ data: "postSuccess" }),
    } as any);
    const res = await buildDriver().execServiceByFetch({ id: "fetch.post" }, { payload: "test" });
    expect(res.ok).toBe(true);
    expect(res.status).toBe(201);
    expect(res.data).toEqual({ data: "postSuccess" });
  });

  test("handles malformed JSON response", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => "{invalid json}",
    } as any);
    const res = await buildDriver().execServiceByFetch({ id: "fetch.get", params: { id: "1" } });
    expect(res.ok).toBe(false);
    expect(res.problem).toContain("Malformed response");
  });

  test("handles empty response", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => "",
    } as any);
    const res = await buildDriver().execServiceByFetch({ id: "fetch.get", params: { id: "1" } });
    expect(res.ok).toBe(false);
    expect(res.problem).toContain("Malformed response");
  });

  test("supports AbortController via abortController.signal", async () => {
    const abortController = new AbortController();
    let capturedOptions: any;
    globalThis.fetch = jest.fn().mockImplementation((_url, options) => {
      capturedOptions = options;
      return Promise.resolve({
        ok: true, status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        text: async () => JSON.stringify({ ok: true }),
      });
    });
    await buildDriver().execServiceByFetch({ id: "fetch.get", params: { id: "1" } }, {}, { abortController });
    expect(capturedOptions.signal).toBe(abortController.signal);
  });

  test("multipart/form-data removes headers to let platform set boundary", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 201,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => JSON.stringify({ ok: true }),
    } as any);
    await buildDriver().execServiceByFetch(
      { id: "fetch.post" }, { a: 1 },
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    const callOpts = (globalThis.fetch as jest.Mock).mock.calls[0][1];
    expect(callOpts.headers).toBeUndefined();
    expect(callOpts.method).toBe("POST");
  });

  describe("response type handling", () => {
    test("handles blob response type", async () => {
      const mockBlob = new Blob(["fake image"], { type: "image/jpeg" });
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: new Headers({ "Content-Type": "image/jpeg" }),
        blob: async () => mockBlob,
      } as any);
      const res = await buildDriver().execServiceByFetch(
        { id: "fetch.get", params: { id: "1" } }, null, { responseType: "blob" }
      );
      expect(res.ok).toBe(true);
      expect(res.data).toEqual(mockBlob);
    });

    test("handles arraybuffer response type", async () => {
      const mockBuf = new ArrayBuffer(8);
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: new Headers({ "Content-Type": "application/octet-stream" }),
        arrayBuffer: async () => mockBuf,
      } as any);
      const res = await buildDriver().execServiceByFetch(
        { id: "fetch.get", params: { id: "1" } }, null, { responseType: "arraybuffer" }
      );
      expect(res.data).toEqual(mockBuf);
    });

    test("handles text response type", async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: new Headers({ "Content-Type": "text/plain" }),
        text: async () => "plain text",
      } as any);
      const res = await buildDriver().execServiceByFetch(
        { id: "fetch.get", params: { id: "1" } }, null, { responseType: "text" }
      );
      expect(res.data).toBe("plain text");
    });

    test("auto-detects image content-type as blob", async () => {
      const mockBlob = new Blob(["img"], { type: "image/png" });
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: new Headers({ "Content-Type": "image/png" }),
        blob: async () => mockBlob,
      } as any);
      const res = await buildDriver().execServiceByFetch({ id: "fetch.get", params: { id: "1" } });
      expect(res.data).toEqual(mockBlob);
    });

    test("auto-detects PDF as blob", async () => {
      const mockBlob = new Blob(["%PDF"], { type: "application/pdf" });
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: new Headers({ "Content-Type": "application/pdf" }),
        blob: async () => mockBlob,
      } as any);
      const res = await buildDriver().execServiceByFetch({ id: "fetch.get", params: { id: "1" } });
      expect(res.data).toEqual(mockBlob);
    });

    test("auto-detects octet-stream as blob", async () => {
      const mockBlob = new Blob(["binary"], { type: "application/octet-stream" });
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: new Headers({ "Content-Type": "application/octet-stream" }),
        blob: async () => mockBlob,
      } as any);
      const res = await buildDriver().execServiceByFetch({ id: "fetch.get", params: { id: "1" } });
      expect(res.data).toEqual(mockBlob);
    });

    test("auto-detects text/html as text", async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: new Headers({ "Content-Type": "text/html" }),
        text: async () => "<html>hello</html>",
      } as any);
      const res = await buildDriver().execServiceByFetch({ id: "fetch.post" }, { a: 1 });
      expect(res.data).toBe("<html>hello</html>");
    });

    test("backward compatibility: JSON response", async () => {
      const mockData = { message: "success", data: [1, 2, 3] };
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        text: async () => JSON.stringify(mockData),
      } as any);
      const res = await buildDriver().execServiceByFetch({ id: "fetch.post" }, { file: "test" });
      expect(res.data).toEqual(mockData);
    });
  });

  describe("error handling", () => {
    test("timeout error from fetch", async () => {
      globalThis.fetch = jest.fn().mockRejectedValue(new Error("Timeout exceeded"));
      const res = await buildDriver().execServiceByFetch({ id: "fetch.get", params: { id: "1" } });
      expect(res.ok).toBe(false);
      expect(res.status).toBe(408);
    });

    test("network error from fetch", async () => {
      globalThis.fetch = jest.fn().mockRejectedValue(new Error("Network down"));
      const res = await buildDriver().execServiceByFetch({ id: "fetch.get", params: { id: "1" } });
      expect(res.status).toBe(503);
    });

    test("AbortError from fetch (DOMException style)", async () => {
      const abortError = new Error("Request aborted");
      abortError.name = "AbortError";
      globalThis.fetch = jest.fn().mockRejectedValue(abortError);
      const res = await buildDriver().execServiceByFetch({ id: "fetch.get", params: { id: "1" } });
      expect(res.status).toBe(408);
    });

    test("error with 'aborted' message", async () => {
      globalThis.fetch = jest.fn().mockRejectedValue(new Error("Request was aborted"));
      const res = await buildDriver().execServiceByFetch({ id: "fetch.get", params: { id: "1" } });
      expect(res.status).toBe(408);
    });

    test("error with 'canceled' message", async () => {
      globalThis.fetch = jest.fn().mockRejectedValue(new Error("Request was canceled"));
      const res = await buildDriver().execServiceByFetch({ id: "fetch.get", params: { id: "1" } });
      expect(res.status).toBe(408);
    });

    test("non-Error primitive rejection", async () => {
      globalThis.fetch = jest.fn().mockRejectedValue("boom");
      const res = await buildDriver().execServiceByFetch({ id: "fetch.get", params: { id: "1" } });
      expect(res.ok).toBe(false);
      expect(res.status).toBe(500);
    });
  });

  describe("transforms", () => {
    test("request and response transforms execute", async () => {
      const driver = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([svcGet])
        .withAddRequestTransformFetch((url, opts) => ({
          url: `${url}&trace=1`,
          requestOptions: { ...opts, headers: { ...(opts.headers as any || {}), "X-Trace": "1" } },
        }))
        .withAddTransformResponseFetch((response) => ({
          ...response, data: { ...(response.data as any), hook: true },
        }))
        .build();

      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        text: async () => JSON.stringify({ ok: true }),
      } as any);

      const res = await driver.execServiceByFetch({ id: "fetch.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
      expect((res.data as any).hook).toBe(true);
      const callUrl = (globalThis.fetch as jest.Mock).mock.calls[0][0];
      expect(callUrl).toContain("trace=1");
    });
  });
});

  describe("edge cases", () => {
    test("handles non-JSON content type as text in default path", async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: new Headers({ "Content-Type": "application/xml" }),
        text: async () => "<xml>data</xml>",
      } as any);
      const res = await buildDriver().execServiceByFetch({ id: "fetch.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
      expect(res.data).toBe("<xml>data</xml>");
    });

    test("handles parse error that is not MalformedResponseError", async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        text: async () => { throw new Error("Read failed"); },
      } as any);
      const res = await buildDriver().execServiceByFetch({ id: "fetch.get", params: { id: "1" } });
      expect(res.ok).toBe(false);
      expect(res.problem).toContain("Failed to parse response");
    });

    test("handles non-ok response with data", async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false, status: 404, statusText: "Not Found",
        headers: new Headers({ "Content-Type": "application/json" }),
        text: async () => JSON.stringify({ error: "not found" }),
      } as any);
      const res = await buildDriver().execServiceByFetch({ id: "fetch.get", params: { id: "1" } });
      expect(res.ok).toBe(false);
      expect(res.status).toBe(404);
      expect(res.data).toEqual({ error: "not found" });
    });
  });

  describe("optional chaining and branch coverage", () => {
    test("fetch GET with signal already set (not via abortController)", async () => {
      const controller = new AbortController();
      let capturedOptions: any;
      globalThis.fetch = jest.fn().mockImplementation((_url, options) => {
        capturedOptions = options;
        return Promise.resolve({
          ok: true, status: 200,
          headers: new Headers({ "Content-Type": "application/json" }),
          text: async () => JSON.stringify({ ok: true }),
        });
      });
      await buildDriver().execServiceByFetch(
        { id: "fetch.get", params: { id: "1" } }, {}, { signal: controller.signal }
      );
      expect(capturedOptions.signal).toBe(controller.signal);
    });

    test("fetch POST with no Content-Type in headers (default applied)", async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        text: async () => JSON.stringify({ ok: true }),
      } as any);
      const res = await buildDriver().execServiceByFetch(
        { id: "fetch.post" }, { data: "test" }, { headers: { "Authorization": "Bearer token" } }
      );
      expect(res.ok).toBe(true);
      const callOpts = (globalThis.fetch as jest.Mock).mock.calls[0][1];
      expect(callOpts.body).toBe(JSON.stringify({ data: "test" }));
    });

    test("fetch GET with no options at all", async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        text: async () => JSON.stringify({ ok: true }),
      } as any);
      const res = await buildDriver().execServiceByFetch({ id: "fetch.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
    });

    test("fetch with no content-type header in response (empty string)", async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify({ ok: true }),
      } as any);
      const res = await buildDriver().execServiceByFetch({ id: "fetch.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
      expect(res.data).toEqual({ ok: true });
    });

    test("fetch non-ok response returns problem and originalError", async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false, status: 500, statusText: "Internal Server Error",
        headers: new Headers({ "Content-Type": "application/json" }),
        text: async () => JSON.stringify({ error: "server error" }),
      } as any);
      const res = await buildDriver().execServiceByFetch({ id: "fetch.get", params: { id: "1" } });
      expect(res.ok).toBe(false);
      expect(res.problem).toBe("Internal Server Error");
      expect(res.originalError).toBe("Internal Server Error");
    });

    test("fetch with DOMException AbortError (not Error instance)", async () => {
      const domError = { name: "AbortError", message: "The operation was aborted" };
      globalThis.fetch = jest.fn().mockRejectedValue(domError);
      const res = await buildDriver().execServiceByFetch({ id: "fetch.get", params: { id: "1" } });
      expect(res.status).toBe(408);
    });
  });

  describe("Content-Type optional chaining branches", () => {
    test("POST with headers that have no Content-Type (null headers?.Content-Type)", async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        text: async () => JSON.stringify({ ok: true }),
      } as any);
      // Service has no Content-Type in options, and we pass no headers
      const svcNoHeaders: ServiceApi = { id: "no-h", url: "api/no-h", method: MethodAPI.post, options: {} };
      const driver = new DriverBuilder().withBaseURL("http://example.com").withServices([svcNoHeaders]).build();
      const res = await driver.execServiceByFetch({ id: "no-h" }, { data: "test" });
      expect(res.ok).toBe(true);
    });

    test("POST with Content-Type that is not multipart (no header deletion)", async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        text: async () => JSON.stringify({ ok: true }),
      } as any);
      const res = await buildDriver().execServiceByFetch(
        { id: "fetch.post" }, { data: "test" },
        { headers: { "Content-Type": "application/json" } }
      );
      expect(res.ok).toBe(true);
      const callOpts = (globalThis.fetch as jest.Mock).mock.calls[0][1];
      expect(callOpts.headers).toBeDefined();
      expect(callOpts.headers["Content-Type"]).toBe("application/json");
    });
  });

  describe("getInfoURL version branches in fetch context", () => {
    test("getInfoURL with versioning enabled and service version", () => {
      const svc: ServiceApi = { id: "v-svc", url: "api/v-svc", method: MethodAPI.get, version: 3 };
      const driver = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([svc])
        .enableVersioning()
        .withGlobalVersion(1)
        .build();
      const info = driver.getInfoURL({ id: "v-svc" });
      // Service version 3 should override global version 1
      expect(info.fullUrl).toBe("http://example.com/v3/api/v-svc");
    });
  });
