/**
 * SSE (Server-Sent Events) stream parser.
 * Parses a ReadableStream into an AsyncIterable of SSE events.
 */

export interface SSEEvent {
  /** Event type (default: "message") */
  event: string;
  /** Event data (may span multiple lines) */
  data: string;
  /** Event ID */
  id: string;
  /** Reconnection time in ms (if server sent retry:) */
  retry?: number;
}

/**
 * Parse a ReadableStream<Uint8Array> into an async iterable of SSE events.
 * Follows the SSE spec: https://html.spec.whatwg.org/multipage/server-sent-events.html
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<SSEEvent, void, undefined> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let currentEvent: string = "message";
  let currentData: string[] = [];
  let currentId: string = "";
  let currentRetry: number | undefined;

  const processLine = (line: string): SSEEvent | null => {
    if (line === "" || line === "\r") {
      if (currentData.length === 0) {
        currentEvent = "message";
        currentData = [];
        currentRetry = undefined;
        return null;
      }

      const event = {
        event: currentEvent,
        data: currentData.join("\n"),
        id: currentId,
        retry: currentRetry,
      };

      currentEvent = "message";
      currentData = [];
      currentRetry = undefined;
      return event;
    }

    const stripped = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (stripped.startsWith(":")) {
      return null;
    }

    const colonIdx = stripped.indexOf(":");
    let field: string;
    let val: string;

    if (colonIdx === -1) {
      field = stripped;
      val = "";
    } else {
      field = stripped.slice(0, colonIdx);
      val = stripped.slice(colonIdx + 1);
      if (val.startsWith(" ")) val = val.slice(1);
    }

    switch (field) {
      case "event":
        currentEvent = val;
        break;
      case "data":
        currentData.push(val);
        break;
      case "id":
        currentId = val;
        break;
      case "retry": {
        const n = parseInt(val, 10);
        if (!isNaN(n)) currentRetry = n;
        break;
      }
    }

    return null;
  };

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let lineStart = 0;
      let lineEnd = buffer.indexOf("\n", lineStart);

      while (lineEnd !== -1) {
        const event = processLine(buffer.slice(lineStart, lineEnd));
        if (event) {
          yield event;
        }

        lineStart = lineEnd + 1;
        lineEnd = buffer.indexOf("\n", lineStart);
      }

      buffer = buffer.slice(lineStart);
    }

    // Process any remaining buffer content
    if (buffer) {
      processLine(buffer);
    }

    // Flush remaining data
    if (currentData.length > 0) {
      yield {
        event: currentEvent,
        data: currentData.join("\n"),
        id: currentId,
        retry: currentRetry,
      };
    }
  } finally {
    try { reader.cancel(); } catch { /* ignore */ }
    reader.releaseLock();
  }
}
