import { parseNDJSONStream } from "../../src/utils/ndjson-parser";

function createStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(encoder.encode(chunks[index++]));
      else controller.close();
    },
  });
}

async function collect<T>(stream: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  const items: T[] = [];
  for await (const item of parseNDJSONStream<T>(stream, signal)) items.push(item);
  return items;
}

describe("parseNDJSONStream", () => {
  test("parses basic NDJSON lines", async () => {
    const stream = createStream(['{"id":1}\n{"id":2}\n']);
    const items = await collect<{ id: number }>(stream);
    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test("handles chunked data across reads", async () => {
    const stream = createStream(['{"id":', '1}\n{"id":2}\n']);
    const items = await collect<{ id: number }>(stream);
    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test("skips empty lines", async () => {
    const stream = createStream(['{"a":1}\n\n{"b":2}\n']);
    const items = await collect(stream);
    expect(items).toEqual([{ a: 1 }, { b: 2 }]);
  });

  test("skips malformed JSON lines", async () => {
    const stream = createStream(['{"ok":true}\n{bad json}\n{"ok":false}\n']);
    const items = await collect(stream);
    expect(items).toEqual([{ ok: true }, { ok: false }]);
  });

  test("flushes remaining buffer at end", async () => {
    const stream = createStream(['{"final":true}']);
    const items = await collect(stream);
    expect(items).toEqual([{ final: true }]);
  });

  test("skips malformed final buffer", async () => {
    const stream = createStream(['{bad']);
    const items = await collect(stream);
    expect(items).toEqual([]);
  });

  test("handles abort signal", async () => {
    const controller = new AbortController();
    let chunkCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        chunkCount++;
        if (chunkCount <= 2) ctrl.enqueue(new TextEncoder().encode(`{"n":${chunkCount}}\n`));
        if (chunkCount === 2) controller.abort();
        if (chunkCount > 2) ctrl.close();
      },
    });
    const items = await collect(stream, controller.signal);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.length).toBeLessThanOrEqual(2);
  });

  test("handles whitespace-only lines", async () => {
    const stream = createStream(['{"a":1}\n   \n{"b":2}\n']);
    const items = await collect(stream);
    expect(items).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
