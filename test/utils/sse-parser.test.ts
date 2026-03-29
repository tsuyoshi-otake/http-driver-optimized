import { parseSSEStream } from "../../src/utils/sse-parser";

function createStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index++]));
      } else {
        controller.close();
      }
    },
  });
}

async function collectEvents(stream: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  const events = [];
  for await (const event of parseSSEStream(stream, signal)) {
    events.push(event);
  }
  return events;
}

describe("parseSSEStream", () => {
  test("parses basic SSE events", async () => {
    const stream = createStream([
      "data: hello\n\n",
      "data: world\n\n",
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ event: "message", data: "hello", id: "", retry: undefined });
    expect(events[1]).toEqual({ event: "message", data: "world", id: "", retry: undefined });
  });

  test("parses multi-line data", async () => {
    const stream = createStream([
      "data: line1\ndata: line2\ndata: line3\n\n",
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("line1\nline2\nline3");
  });

  test("parses event type, id, and retry", async () => {
    const stream = createStream([
      "event: update\nid: 42\nretry: 5000\ndata: payload\n\n",
    ]);
    const events = await collectEvents(stream);
    expect(events[0]).toEqual({ event: "update", data: "payload", id: "42", retry: 5000 });
  });

  test("ignores comment lines", async () => {
    const stream = createStream([
      ": this is a comment\ndata: actual\n\n",
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("actual");
  });

  test("handles fields without colon", async () => {
    const stream = createStream([
      "data\n\n",
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("");
  });

  test("handles chunked data across multiple reads", async () => {
    const stream = createStream([
      "data: hel",
      "lo\n\ndata: wor",
      "ld\n\n",
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(2);
    expect(events[0].data).toBe("hello");
    expect(events[1].data).toBe("world");
  });

  test("handles \\r\\n line endings", async () => {
    const stream = createStream([
      "data: hello\r\n\r\n",
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("hello");
  });

  test("skips empty events (no data lines)", async () => {
    const stream = createStream([
      "event: ping\n\ndata: real\n\n",
    ]);
    const events = await collectEvents(stream);
    // First event has no data, so it's skipped
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("real");
  });

  test("flushes remaining data at end of stream", async () => {
    // No trailing \n\n
    const stream = createStream([
      "data: final",
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("final");
  });

  test("handles abort signal", async () => {
    const controller = new AbortController();
    let chunkCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        chunkCount++;
        if (chunkCount <= 2) {
          ctrl.enqueue(new TextEncoder().encode(`data: chunk${chunkCount}\n\n`));
        }
        if (chunkCount === 2) {
          controller.abort();
        }
        if (chunkCount > 2) {
          ctrl.close();
        }
      },
    });

    const events = [];
    for await (const event of parseSSEStream(stream, controller.signal)) {
      events.push(event);
    }
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.length).toBeLessThanOrEqual(2);
  });

  test("ignores invalid retry values", async () => {
    const stream = createStream([
      "retry: notanumber\ndata: test\n\n",
    ]);
    const events = await collectEvents(stream);
    expect(events[0].retry).toBeUndefined();
  });

  test("handles data with colon in value", async () => {
    const stream = createStream([
      "data: key: value: extra\n\n",
    ]);
    const events = await collectEvents(stream);
    expect(events[0].data).toBe("key: value: extra");
  });

  test("resets event type after dispatch", async () => {
    const stream = createStream([
      "event: custom\ndata: first\n\ndata: second\n\n",
    ]);
    const events = await collectEvents(stream);
    expect(events[0].event).toBe("custom");
    expect(events[1].event).toBe("message"); // Reset to default
  });
});

  test("handles remaining buffer with event/id/retry fields", async () => {
    const stream = createStream(["event: custom\nid: 99\nretry: 3000\ndata: buffered"]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ event: "custom", data: "buffered", id: "99", retry: 3000 });
  });

  test("handles remaining buffer with comment (ignored)", async () => {
    const stream = createStream([": comment only"]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(0);
  });

  test("handles remaining buffer with field without colon", async () => {
    const stream = createStream(["data"]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("");
  });

  test("handles remaining buffer with invalid retry", async () => {
    const stream = createStream(["retry: abc\ndata: test"]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0].retry).toBeUndefined();
  });

  test("handles remaining buffer with \\r ending", async () => {
    const stream = createStream(["data: trimmed\r"]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("trimmed");
  });

  test("handles empty remaining buffer", async () => {
    const stream = createStream(["data: complete\n\n"]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("complete");
  });

  test("buffer flush processes event field", async () => {
    // Single chunk with no newline - entire thing stays in buffer
    const stream = createStream(["event: custom"]);
    const events = await collectEvents(stream);
    // No data lines, so no event emitted
    expect(events).toHaveLength(0);
  });

  test("buffer flush processes id field then data", async () => {
    // Two chunks: first gets processed as lines, second stays in buffer
    const stream = createStream(["data: hello\n", "id: 42"]);
    // "data: hello\n" → lines = ["data: hello", ""], buffer = ""
    // "id: 42" → lines = ["id: 42"], but pop() leaves buffer = "id: 42", lines = []
    // Actually: buffer="" + "id: 42" = "id: 42", split("\n") = ["id: 42"], pop = "id: 42", lines = []
    // So id: 42 stays in buffer, data: hello was processed but no empty line to dispatch
    // At flush: buffer = "id: 42" → sets currentId, then currentData has "hello" → yields
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("hello");
    expect(events[0].id).toBe("42");
  });

  test("buffer flush processes retry field", async () => {
    const stream = createStream(["data: test\n", "retry: 5000"]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0].retry).toBe(5000);
  });

  test("buffer flush processes event field with data", async () => {
    const stream = createStream(["data: payload\n", "event: update"]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("update");
    expect(events[0].data).toBe("payload");
  });

  test("lines.pop returns undefined fallback", async () => {
    // Empty stream
    const stream = createStream([""]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(0);
  });
