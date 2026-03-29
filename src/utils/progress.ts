export interface ProgressInfo {
  loaded: number;
  total: number;
  percent: number;
}

export type ProgressCallback = (info: ProgressInfo) => void;

/**
 * Reads a fetch Response body with download progress tracking.
 * Returns the complete body as an ArrayBuffer.
 */
export async function fetchWithDownloadProgress(
  response: Response,
  onProgress: ProgressCallback
): Promise<ArrayBuffer> {
  const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
  const total = contentLength || 0;

  if (!response.body) {
    onProgress({ loaded: 0, total: 0, percent: -1 });
    return new ArrayBuffer(0);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      loaded += value.byteLength;

      onProgress({
        loaded,
        total,
        percent: total > 0 ? Math.round((loaded / total) * 100) : -1,
      });
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result.buffer;
}

/**
 * Creates a Request body wrapper that tracks upload progress.
 * Uses pull-based reading to avoid buffering entire source in memory.
 */
export function createUploadProgressBody(
  body: BodyInit,
  onProgress: ProgressCallback
): { body: ReadableStream<Uint8Array>; headers?: Record<string, string> } {
  let sourceStream: ReadableStream<Uint8Array>;
  let total = 0;

  if (body instanceof ArrayBuffer) {
    total = body.byteLength;
    sourceStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(body));
        controller.close();
      },
    });
  } else if (typeof body === "string") {
    const encoded = new TextEncoder().encode(body);
    total = encoded.byteLength;
    sourceStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    });
  } else if (body instanceof Uint8Array) {
    total = body.byteLength;
    sourceStream = new ReadableStream({
      start(controller) {
        controller.enqueue(body);
        controller.close();
      },
    });
  } else {
    onProgress({ loaded: 0, total: 0, percent: -1 });
    return { body: body as unknown as ReadableStream<Uint8Array> };
  }

  let loaded = 0;
  const sourceReader = sourceStream.getReader();

  const trackedStream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await sourceReader.read();
      if (done) {
        controller.close();
        return;
      }
      loaded += value.byteLength;
      onProgress({
        loaded,
        total,
        percent: total > 0 ? Math.round((loaded / total) * 100) : -1,
      });
      controller.enqueue(value);
    },
  });

  return { body: trackedStream };
}
