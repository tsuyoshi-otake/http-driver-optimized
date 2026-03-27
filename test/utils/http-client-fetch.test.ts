import { MethodAPI } from "../../src/types/driver";
import { httpClientFetch } from "../../src/utils/index";

describe("httpClientFetch", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns formatted response on successful GET fetch", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => JSON.stringify({ message: "success" }),
    } as any);

    const response = await httpClientFetch(
      { url: "http://example.com/api", method: MethodAPI.get, param: {} },
      { foo: "bar" },
      { headers: { "Content-Type": "application/json" } }
    );
    expect(response.ok).toBe(true);
    expect(response.data).toEqual({ message: "success" });
  });

  test("handles fetch failure and returns error response", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error("Network error"));
    const response = await httpClientFetch(
      { url: "http://example.com/api", method: MethodAPI.get, param: {} }
    );
    expect(response.ok).toBe(false);
    expect(response.problem).toContain("Error fetching data");
    expect(response.status).toBe(500);
  });

  test("handles non-OK fetch response", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 404, statusText: "Not Found",
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => "Not Found",
    } as any);

    const response = await httpClientFetch(
      { url: "http://example.com/api", method: MethodAPI.get, param: {} }
    );
    expect(response.ok).toBe(false);
    expect(response.problem).toBe("Not Found");
    expect(response.status).toBe(404);
  });

  test("handles non-JSON response text gracefully", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ "Content-Type": "text/plain" }),
      text: async () => "This is not JSON",
    } as any);

    const response = await httpClientFetch(
      { url: "http://example.com/test", method: MethodAPI.get, param: {} }
    );
    expect(response.ok).toBe(true);
    expect(response.data).toBe("This is not JSON");
  });

  test("handles POST method by setting request body", async () => {
    const testPayload = { name: "John", age: "30" };
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 201,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => JSON.stringify({ id: "123" }),
    } as any);

    const response = await httpClientFetch(
      { url: "http://example.com/api/resource", method: MethodAPI.post, param: {} },
      testPayload, {}
    );
    const callArgs = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(callArgs[1].method).toBe("POST");
    expect(callArgs[1].body).toBe(JSON.stringify(testPayload));
    expect(response.ok).toBe(true);
  });

  test("deletes headers when Content-Type is multipart/form-data", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => JSON.stringify({ success: true }),
    } as any);

    await httpClientFetch(
      { url: "http://example.com/upload", method: MethodAPI.post, param: {} },
      { name: "test" },
      { headers: { "Content-Type": "multipart/form-data" } }
    );

    const callArgs = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(callArgs[1].headers).toBeUndefined();
    expect(callArgs[1].method).toBe("POST");
  });

  test("handles undefined urlBuilder.param", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => JSON.stringify({ success: true }),
    } as any);

    const response = await httpClientFetch({
      url: "http://example.com/test", method: MethodAPI.get as any,
    } as any);
    expect(response.ok).toBe(true);
  });
});

  test("handles POST with no headers at all (null options)", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => JSON.stringify({ ok: true }),
    } as any);

    const response = await httpClientFetch(
      { url: "http://example.com/api", method: MethodAPI.post, param: {} },
      { data: "test" }
    );
    expect(response.ok).toBe(true);
    const callArgs = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(callArgs[1].headers["Content-Type"]).toBe("application/json");
  });

  test("handles POST with empty options object", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => JSON.stringify({ ok: true }),
    } as any);

    const response = await httpClientFetch(
      { url: "http://example.com/api", method: MethodAPI.post, param: {} },
      { data: "test" },
      {}
    );
    expect(response.ok).toBe(true);
  });

  test("handles JSON.parse returning null", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => "null",
    } as any);

    const response = await httpClientFetch(
      { url: "http://example.com/api", method: MethodAPI.get, param: {} }
    );
    expect(response.ok).toBe(true);
    // parseFetchResponse correctly parses "null" as JSON null
    expect(response.data).toBeNull();
  });

  test("handles POST with headers that have Content-Type but not multipart", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => JSON.stringify({ ok: true }),
    } as any);

    const response = await httpClientFetch(
      { url: "http://example.com/api", method: MethodAPI.post, param: {} },
      { data: "test" },
      { headers: { "Content-Type": "application/json" } }
    );
    expect(response.ok).toBe(true);
    const callArgs = (globalThis.fetch as jest.Mock).mock.calls[0];
    // Headers should NOT be deleted for non-multipart
    expect(callArgs[1].headers).toBeDefined();
    expect(callArgs[1].headers["Content-Type"]).toBe("application/json");
  });

  test("handles POST with headers object that has no hasOwnProperty for Content-Type check", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => JSON.stringify({ ok: true }),
    } as any);

    // Headers with Content-Type set - the hasOwnProperty check should pass
    const response = await httpClientFetch(
      { url: "http://example.com/api", method: MethodAPI.post, param: {} },
      { data: "test" },
      { headers: { "Content-Type": "text/xml" } }
    );
    expect(response.ok).toBe(true);
  });

  test("handles GET with no options and no payload", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => JSON.stringify({ ok: true }),
    } as any);

    const response = await httpClientFetch(
      { url: "http://example.com/api", method: MethodAPI.get, param: {} }
    );
    expect(response.ok).toBe(true);
  });

  test("handles POST where headers?.hasOwnProperty is undefined (null prototype headers)", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => JSON.stringify({ ok: true }),
    } as any);

    // Pass headers as null prototype object - hasOwnProperty?.() will be undefined
    const headers = Object.create(null);
    headers["Content-Type"] = "application/json";

    const response = await httpClientFetch(
      { url: "http://example.com/api", method: MethodAPI.post, param: {} },
      { data: "test" },
      { headers }
    );
    // Should work because we use ?. for hasOwnProperty
    expect(response.ok).toBe(true);
  });

  test("handles POST where headers is completely undefined", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => JSON.stringify({ ok: true }),
    } as any);

    const response = await httpClientFetch(
      { url: "http://example.com/api", method: MethodAPI.post, param: {} },
      { data: "test" },
      { /* no headers at all */ }
    );
    expect(response.ok).toBe(true);
    const callArgs = (globalThis.fetch as jest.Mock).mock.calls[0];
    // Default Content-Type should be set
    expect(callArgs[1].headers["Content-Type"]).toBe("application/json");
  });

  test("handles POST where headers?.Content-Type is undefined (fallback to application/json)", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => JSON.stringify({ ok: true }),
    } as any);

    const response = await httpClientFetch(
      { url: "http://example.com/api", method: MethodAPI.post, param: {} },
      { data: "test" },
      { headers: { "Authorization": "Bearer token" } }
    );
    expect(response.ok).toBe(true);
  });

  test("falls back to text when parseFetchResponse throws", async () => {
    // Mock a response where text() returns empty string first (triggers MalformedResponseError in parseFetchResponse)
    // then returns fallback text on second call
    let textCallCount = 0;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => {
        textCallCount++;
        if (textCallCount === 1) return ""; // parseFetchResponse will throw MalformedResponseError
        return "fallback";
      },
    } as any);

    const response = await httpClientFetch(
      { url: "http://example.com/api", method: MethodAPI.get, param: {} }
    );
    expect(response.ok).toBe(true);
    expect(response.data).toBe("fallback");
  });

  test("sets data to null when both parseFetchResponse and res.text() throw", async () => {
    let textCallCount = 0;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: async () => {
        textCallCount++;
        if (textCallCount === 1) return ""; // parseFetchResponse throws
        throw new Error("stream consumed"); // fallback text() also throws
      },
    } as any);

    const response = await httpClientFetch(
      { url: "http://example.com/api", method: MethodAPI.get, param: {} }
    );
    expect(response.ok).toBe(true);
    expect(response.data).toBeNull();
  });
