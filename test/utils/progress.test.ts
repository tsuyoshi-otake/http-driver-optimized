import { fetchWithDownloadProgress, createUploadProgressBody } from "../../src/utils/progress";

function createMockResponse(chunks: Uint8Array[], contentLength?: number): Response {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else controller.close();
    },
  });
  const headers = new Headers();
  if (contentLength !== undefined) headers.set("content-length", String(contentLength));
  return { body, headers } as unknown as Response;
}

describe("fetchWithDownloadProgress", () => {
  test("tracks download progress with known content-length", async () => {
    const chunk1 = new Uint8Array([1, 2, 3]);
    const chunk2 = new Uint8Array([4, 5]);
    const progress: Array<{ loaded: number; total: number; percent: number }> = [];

    const result = await fetchWithDownloadProgress(
      createMockResponse([chunk1, chunk2], 5),
      (info) => progress.push({ ...info })
    );

    expect(result.byteLength).toBe(5);
    expect(progress.length).toBe(2);
    expect(progress[0]).toEqual({ loaded: 3, total: 5, percent: 60 });
    expect(progress[1]).toEqual({ loaded: 5, total: 5, percent: 100 });
  });

  test("tracks download progress with unknown content-length", async () => {
    const chunk = new Uint8Array([1, 2, 3]);
    const progress: Array<{ percent: number }> = [];

    await fetchWithDownloadProgress(
      createMockResponse([chunk]),
      (info) => progress.push({ percent: info.percent })
    );

    expect(progress[0].percent).toBe(-1);
  });

  test("handles response with no body", async () => {
    const progress: Array<{ loaded: number }> = [];
    const res = { body: null, headers: new Headers() } as unknown as Response;

    const result = await fetchWithDownloadProgress(res, (info) => progress.push({ loaded: info.loaded }));
    expect(result.byteLength).toBe(0);
    expect(progress[0].loaded).toBe(0);
  });
});

describe("createUploadProgressBody", () => {
  test("tracks string body upload progress", async () => {
    const progress: Array<{ loaded: number; total: number; percent: number }> = [];
    const { body } = createUploadProgressBody("hello world", (info) => progress.push({ ...info }));

    // Read the stream to trigger progress
    const reader = (body as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    expect(progress.length).toBeGreaterThan(0);
    expect(progress[progress.length - 1].percent).toBe(100);
  });

  test("tracks ArrayBuffer body upload progress", async () => {
    const buf = new ArrayBuffer(10);
    const progress: Array<{ loaded: number }> = [];
    const { body } = createUploadProgressBody(buf, (info) => progress.push({ loaded: info.loaded }));

    const reader = (body as ReadableStream<Uint8Array>).getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(progress[progress.length - 1].loaded).toBe(10);
  });

  test("tracks Uint8Array body upload progress", async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const progress: Array<{ loaded: number }> = [];
    const { body } = createUploadProgressBody(data, (info) => progress.push({ loaded: info.loaded }));

    const reader = (body as ReadableStream<Uint8Array>).getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(progress[progress.length - 1].loaded).toBe(5);
  });

  test("handles unsupported body types with unknown progress", () => {
    const progress: Array<{ percent: number }> = [];
    const blob = { type: "blob" } as unknown as BodyInit;
    createUploadProgressBody(blob, (info) => progress.push({ percent: info.percent }));
    expect(progress[0].percent).toBe(-1);
  });
});

  test("upload progress with zero-length body shows -1 percent", async () => {
    const progress: Array<{ percent: number }> = [];
    const { body } = createUploadProgressBody("", (info) => progress.push({ percent: info.percent }));
    const reader = (body as ReadableStream<Uint8Array>).getReader();
    while (true) { const { done } = await reader.read(); if (done) break; }
    // Empty string has 0 bytes, so total=0, percent=-1
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[0].percent).toBe(-1);
  });
