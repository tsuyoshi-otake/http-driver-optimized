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

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop()!;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          yield JSON.parse(trimmed) as T;
        } catch {
          // Skip malformed lines
        }
      }
    }

    // Flush remaining buffer
    if (buffer.trim()) {
      try {
        yield JSON.parse(buffer.trim()) as T;
      } catch {
        // Skip malformed final line
      }
    }
  } finally {
    try { reader.cancel(); } catch { /* ignore */ }
    reader.releaseLock();
  }
}
