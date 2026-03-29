import { parseFetchResponse } from "../../src/utils/response-parser";
import { MalformedResponseError } from "../../src/types/errors";

function mockResponse(opts: { contentType?: string; body?: string; blob?: Blob; arrayBuffer?: ArrayBuffer; ok?: boolean; status?: number }): Response {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: new Headers(opts.contentType ? { "Content-Type": opts.contentType } : {}),
    text: async () => opts.body ?? "",
    blob: async () => opts.blob ?? new Blob(),
    arrayBuffer: async () => opts.arrayBuffer ?? new ArrayBuffer(0),
  } as any;
}

describe("parseFetchResponse", () => {
  test("returns blob when responseType is blob", async () => {
    const blob = new Blob(["data"]);
    const data = await parseFetchResponse(mockResponse({ blob }), "blob");
    expect(data).toBe(blob);
  });

  test("returns arraybuffer when responseType is arraybuffer", async () => {
    const buf = new ArrayBuffer(8);
    const data = await parseFetchResponse(mockResponse({ arrayBuffer: buf }), "arraybuffer");
    expect(data).toBe(buf);
  });

  test("returns text when responseType is text", async () => {
    const data = await parseFetchResponse(mockResponse({ body: "hello" }), "text");
    expect(data).toBe("hello");
  });

  test("auto-detects image as blob", async () => {
    const blob = new Blob(["img"]);
    const data = await parseFetchResponse(mockResponse({ contentType: "image/png", blob }));
    expect(data).toBe(blob);
  });

  test("auto-detects PDF as blob", async () => {
    const blob = new Blob(["%PDF"]);
    const data = await parseFetchResponse(mockResponse({ contentType: "application/pdf", blob }));
    expect(data).toBe(blob);
  });

  test("auto-detects octet-stream as blob", async () => {
    const blob = new Blob(["bin"]);
    const data = await parseFetchResponse(mockResponse({ contentType: "application/octet-stream", blob }));
    expect(data).toBe(blob);
  });

  test("auto-detects text/html as text", async () => {
    const data = await parseFetchResponse(mockResponse({ contentType: "text/html", body: "<html>" }));
    expect(data).toBe("<html>");
  });

  test("parses JSON for application/json", async () => {
    const data = await parseFetchResponse(mockResponse({ contentType: "application/json", body: '{"a":1}' }));
    expect(data).toEqual({ a: 1 });
  });

  test("parses JSON when no content-type", async () => {
    const data = await parseFetchResponse(mockResponse({ body: '{"a":1}' }));
    expect(data).toEqual({ a: 1 });
  });

  test("throws MalformedResponseError for empty body", async () => {
    await expect(parseFetchResponse(mockResponse({ contentType: "application/json", body: "" })))
      .rejects.toThrow(MalformedResponseError);
  });

  test("returns null for 204 No Content with empty body", async () => {
    const data = await parseFetchResponse(mockResponse({ contentType: "application/json", body: "", status: 204 }));
    expect(data).toBeNull();
  });

  test("returns null for 304 Not Modified with empty body", async () => {
    const data = await parseFetchResponse(mockResponse({ contentType: "application/json", body: "", status: 304 }));
    expect(data).toBeNull();
  });

  test("throws MalformedResponseError for invalid JSON", async () => {
    await expect(parseFetchResponse(mockResponse({ contentType: "application/json", body: "{bad}" })))
      .rejects.toThrow(MalformedResponseError);
  });

  test("returns text for non-JSON content type in default path", async () => {
    const data = await parseFetchResponse(mockResponse({ contentType: "application/xml", body: "<xml/>" }));
    expect(data).toBe("<xml/>");
  });
});
