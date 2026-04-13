const { performance } = require("node:perf_hooks");

const TOTAL_BYTES = Number(process.env.BENCH_PROGRESS_TOTAL_BYTES ?? 32 * 1024 * 1024);
const CHUNK_BYTES = Number(process.env.BENCH_PROGRESS_CHUNK_BYTES ?? 64 * 1024);
const ITERATIONS = Number(process.env.BENCH_PROGRESS_ITERATIONS ?? 5);

function toMiB(value) {
  return Number((value / (1024 * 1024)).toFixed(2));
}

function createResponse(totalBytes, chunkBytes, includeContentLength) {
  let emitted = 0;
  const headers = new Headers();

  if (includeContentLength) {
    headers.set("content-length", String(totalBytes));
  }

  return {
    headers,
    body: new ReadableStream({
      pull(controller) {
        if (emitted >= totalBytes) {
          controller.close();
          return;
        }

        const size = Math.min(chunkBytes, totalBytes - emitted);
        controller.enqueue(new Uint8Array(size));
        emitted += size;
      },
    }),
  };
}

function mergeChunks(chunks, totalBytes) {
  const result = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

function toOwnedArrayBuffer(buffer, usedBytes = buffer.byteLength) {
  return usedBytes === buffer.byteLength
    ? buffer.buffer
    : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + usedBytes);
}

function createTracker() {
  let peakBufferedBytes = 0;

  return {
    record(bufferedBytes) {
      if (bufferedBytes > peakBufferedBytes) {
        peakBufferedBytes = bufferedBytes;
      }
    },
    peak() {
      return peakBufferedBytes;
    },
  };
}

async function legacyFetchWithDownloadProgress(response, onProgress, tracker) {
  const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
  const total = contentLength || 0;

  if (!response.body) {
    onProgress({ loaded: 0, total: 0, percent: -1 });
    tracker.record(0);
    return new ArrayBuffer(0);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      loaded += value.byteLength;
      tracker.record(loaded);

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
  tracker.record(loaded + result.byteLength);

  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result.buffer;
}

async function optimizedFetchWithDownloadProgress(response, onProgress, tracker) {
  const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
  const total = contentLength || 0;

  if (!response.body) {
    onProgress({ loaded: 0, total: 0, percent: -1 });
    tracker.record(0);
    return new ArrayBuffer(0);
  }

  const reader = response.body.getReader();
  let preallocatedBuffer = total > 0 ? new Uint8Array(total) : null;
  const fallbackChunks = preallocatedBuffer ? [] : [];
  let loaded = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const nextLoaded = loaded + value.byteLength;

      if (preallocatedBuffer) {
        if (nextLoaded <= preallocatedBuffer.byteLength) {
          preallocatedBuffer.set(value, loaded);
        } else {
          if (loaded > 0) {
            fallbackChunks.push(preallocatedBuffer.subarray(0, loaded));
          }
          fallbackChunks.push(value);
          preallocatedBuffer = null;
        }
      } else {
        fallbackChunks.push(value);
      }

      loaded = nextLoaded;

      tracker.record(
        preallocatedBuffer ? preallocatedBuffer.byteLength : loaded
      );

      onProgress({
        loaded,
        total,
        percent: total > 0 ? Math.round((loaded / total) * 100) : -1,
      });
    }
  } finally {
    reader.releaseLock();
  }

  if (preallocatedBuffer) {
    tracker.record(preallocatedBuffer.byteLength);
    return toOwnedArrayBuffer(preallocatedBuffer, loaded);
  }

  const result = mergeChunks(fallbackChunks, loaded);
  tracker.record(loaded + result.byteLength);
  return toOwnedArrayBuffer(result);
}

async function measureCase(name, includeContentLength, runner) {
  let totalDurationMs = 0;
  let peakBufferedBytes = 0;
  let resultBytes = 0;

  for (let index = 0; index < ITERATIONS; index += 1) {
    const tracker = createTracker();
    const startedAt = performance.now();

    const result = await runner(
      createResponse(TOTAL_BYTES, CHUNK_BYTES, includeContentLength),
      () => {},
      tracker
    );

    totalDurationMs += performance.now() - startedAt;
    peakBufferedBytes += tracker.peak();
    resultBytes = result.byteLength;
  }

  return {
    benchmark: name,
    iterations: ITERATIONS,
    totalMiB: toMiB(TOTAL_BYTES),
    chunkKiB: Number((CHUNK_BYTES / 1024).toFixed(2)),
    resultMiB: toMiB(resultBytes),
    avgMs: Number((totalDurationMs / ITERATIONS).toFixed(2)),
    avgPeakBufferedMiB: toMiB(peakBufferedBytes / ITERATIONS),
  };
}

async function main() {
  const results = [
    await measureCase("legacy.known-length", true, legacyFetchWithDownloadProgress),
    await measureCase("optimized.known-length", true, optimizedFetchWithDownloadProgress),
    await measureCase("legacy.unknown-length", false, legacyFetchWithDownloadProgress),
    await measureCase("optimized.unknown-length", false, optimizedFetchWithDownloadProgress),
  ];

  console.table(results);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
