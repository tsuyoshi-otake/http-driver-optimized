const { performance } = require("node:perf_hooks");
const { DriverBuilder, MethodAPI } = require("../src/index");
const { parseNDJSONStream } = require("../src/utils/ndjson-parser");
const { parseSSEStream } = require("../src/utils/sse-parser");

const SERVICE_COUNT = Number(process.env.BENCH_SERVICE_COUNT ?? 1000);
const INFO_URL_ITERATIONS = Number(process.env.BENCH_INFO_URL_ITERATIONS ?? 50000);
const EXEC_ITERATIONS = Number(process.env.BENCH_EXEC_ITERATIONS ?? 2000);
const STREAM_ITERATIONS = Number(process.env.BENCH_STREAM_ITERATIONS ?? 400);
const WARMUP_ITERATIONS = Number(process.env.BENCH_WARMUP_ITERATIONS ?? 200);

function createServices(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `service-${index}`,
    url: "resources/{id}/details",
    method: MethodAPI.get,
  }));
}

function createPayload(width = 40, depth = 5) {
  const payload = {};
  for (let i = 0; i < width; i += 1) {
    payload[`filter_${i}`] = {
      flag: i % 2 === 0,
      nested: Array.from({ length: depth }, (_, j) => ({
        value: `${i}-${j}`,
        rank: j,
      })),
    };
  }
  return payload;
}

function formatMetric(name, iterations, totalMs) {
  return {
    benchmark: name,
    iterations,
    totalMs: Number(totalMs.toFixed(2)),
    avgUs: Number(((totalMs / iterations) * 1000).toFixed(2)),
  };
}

function chunkString(value, chunkSize) {
  const chunks = [];
  for (let index = 0; index < value.length; index += chunkSize) {
    chunks.push(value.slice(index, index + chunkSize));
  }
  return chunks;
}

function createChunkedStream(chunks) {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }

      controller.enqueue(new TextEncoder().encode(chunks[index]));
      index += 1;
    },
  });
}

async function consumeAsyncIterable(iterable) {
  let count = 0;
  for await (const _item of iterable) {
    count += 1;
  }
  return count;
}

function benchSync(name, iterations, fn) {
  for (let i = 0; i < Math.min(WARMUP_ITERATIONS, iterations); i += 1) {
    fn(i);
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    fn(i);
  }
  return formatMetric(name, iterations, performance.now() - start);
}

async function benchAsync(name, iterations, fn) {
  for (let i = 0; i < Math.min(WARMUP_ITERATIONS, iterations); i += 1) {
    await fn(i);
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    await fn(i);
  }
  return formatMetric(name, iterations, performance.now() - start);
}

async function main() {
  const services = createServices(SERVICE_COUNT);
  const payload = createPayload();
  const target = {
    id: `service-${SERVICE_COUNT - 1}`,
    params: { id: "999" },
  };
  const ndjsonLine = JSON.stringify({ id: 1, message: "x".repeat(8192) }) + "\n";
  const sseEvent = `data: ${"x".repeat(8192)}\n\n`;
  const ndjsonChunks = chunkString(ndjsonLine, 64);
  const sseChunks = chunkString(sseEvent, 64);

  const axiosDriver = new DriverBuilder()
    .withBaseURL("https://api.example.com")
    .withServices(services)
    .build();

  axiosDriver.get = async () => ({
    status: 200,
    statusText: "OK",
    data: { ok: true },
    headers: { "x-bench": "1" },
  });

  const fetchDriver = new DriverBuilder()
    .withBaseURL("https://api.example.com")
    .withServices(services)
    .build();

  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const results = [
      benchSync("driver.getInfoURL", INFO_URL_ITERATIONS, () => {
        axiosDriver.getInfoURL(target, payload);
      }),
      await benchAsync("driver.execService", EXEC_ITERATIONS, async () => {
        await axiosDriver.execService(target, payload);
      }),
      await benchAsync("driver.execServiceByFetch", EXEC_ITERATIONS, async () => {
        await fetchDriver.execServiceByFetch(target, payload);
      }),
      await benchAsync("parseNDJSONStream.long-line", STREAM_ITERATIONS, async () => {
        await consumeAsyncIterable(parseNDJSONStream(createChunkedStream(ndjsonChunks)));
      }),
      await benchAsync("parseSSEStream.long-line", STREAM_ITERATIONS, async () => {
        await consumeAsyncIterable(parseSSEStream(createChunkedStream(sseChunks)));
      }),
    ];

    console.table(results);
    console.log(JSON.stringify(results, null, 2));
  } finally {
    global.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
