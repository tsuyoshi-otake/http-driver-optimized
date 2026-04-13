/**
 * NDJSON (Newline-Delimited JSON) stream parser.
 * Parses a ReadableStream into an AsyncIterable of parsed JSON objects.
 * Used for streaming APIs that return one JSON object per line.
 */
export async function* parseNDJSONStream<T = unknown>(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<T, void, undefined> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const parseLine = (line: string): T | undefined => {
    const trimmed = line.trim();
    if (!trimmed) return undefined;

    try {
      return JSON.parse(trimmed) as T;
    } catch {
      return undefined;
    }
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
        const parsedLine = parseLine(buffer.slice(lineStart, lineEnd));
        if (parsedLine !== undefined) {
          yield parsedLine;
        }

        lineStart = lineEnd + 1;
        lineEnd = buffer.indexOf("\n", lineStart);
      }

      buffer = buffer.slice(lineStart);
    }

    // Flush remaining buffer
    if (buffer) {
      const parsedLine = parseLine(buffer);
      if (parsedLine !== undefined) {
        yield parsedLine;
      }
    }
  } finally {
    try { reader.cancel(); } catch { /* ignore */ }
    reader.releaseLock();
  }
}
