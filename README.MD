# http-driver-optimized

![Test Coverage](https://img.shields.io/badge/Coverage-100%25-brightgreen.svg)

Fully typed, per-service HTTP client for Axios and Fetch with built-in retry, caching, deduplication, middleware, and observability.

Repository and npm package name: `@tsuyoshi-otake/http-driver-optimized`.

## Install

```bash
npm install @tsuyoshi-otake/http-driver-optimized
```

## Quick Start

```ts
import { DriverBuilder, MethodAPI } from "@tsuyoshi-otake/http-driver-optimized";

const api = new DriverBuilder()
  .withBaseURL("https://api.example.com")
  .withServices([
    { id: "users.list", url: "users", method: MethodAPI.get },
    { id: "users.detail", url: "users/{id}", method: MethodAPI.get },
    { id: "users.create", url: "users", method: MethodAPI.post },
  ])
  .build();

// Axios path
const users = await api.execService({ id: "users.list" });

// Fetch path
const user = await api.execServiceByFetch(
  { id: "users.detail", params: { id: "1" } }
);

// Both return the same shape
console.log(user.ok, user.status, user.data, user.duration);
```

## Features

- Dual HTTP paths — Axios (`execService`) and Fetch (`execServiceByFetch`)
- Full TypeScript support with generic `ResponseFormat<T>`
- SSE streaming (`execServiceByStream`) with spec-compliant parser
- NDJSON streaming (`execServiceByNDJSON`) for line-delimited JSON
- GraphQL client helper (`createGraphQLClient`) with query/mutation shortcuts
- Upload/download progress tracking via ReadableStream
- WebSocket client with auto-reconnect and typed messages
- Retry with fixed/exponential backoff (global or per-service)
- In-memory response caching with TTL, max-size eviction, and periodic cleanup
- Automatic request deduplication for concurrent bodyless calls (GET, HEAD, DELETE)
- Per-service and global timeout via `AbortSignal.timeout()` with fallback
- Middleware pipeline (onion model) with double-call protection
- Observability hooks (`onRequest` / `onResponse`)
- URL versioning with multiple positioning strategies
- URL parameter encoding via `encodeURIComponent` for safe URL construction
- Sync/async request and response transforms (Axios & Fetch)
- Token refresh interceptor with queue management
- Multipart/form-data with bracket notation (`parent[child]`) and automatic boundary handling
- Standardized error normalization (TimeoutError, NetworkError, etc.)
- Proper handling of 204 No Content and 304 Not Modified responses

## Response Shape

Every call returns:

```ts
interface ResponseFormat<T = unknown> {
  ok: boolean;           // true if status 200-299
  status: number;        // HTTP status code
  data: T;               // Response body
  problem: string | null;
  originalError: string | null;
  headers?: Headers | Record<string, string> | null;
  duration: number;      // Request time in ms
}
```

## Service Definition

```ts
import { MethodAPI, type ServiceApi } from "@tsuyoshi-otake/http-driver-optimized";

const services: ServiceApi[] = [
  { id: "posts.list", url: "posts", method: MethodAPI.get },
  { id: "posts.detail", url: "posts/{id}", method: MethodAPI.get },
  { id: "posts.create", url: "posts", method: MethodAPI.post },
  // Per-service timeout and retry
  {
    id: "reports.generate",
    url: "reports",
    method: MethodAPI.get,
    timeout: 30000,
    retry: { maxAttempts: 3, delay: 2000, backoff: "exponential" },
  },
];
```

## Retry

```ts
// Global — applies to all services
const api = new DriverBuilder()
  .withBaseURL("https://api.example.com")
  .withServices(services)
  .withRetry({ maxAttempts: 3, delay: 1000, backoff: "exponential" })
  .build();

// Per-service — overrides global
const services: ServiceApi[] = [
  {
    id: "flaky",
    url: "api/flaky",
    method: MethodAPI.get,
    retry: { maxAttempts: 5, delay: 500, retryOn: [502, 503] },
  },
];
```

```ts
interface RetryConfig {
  maxAttempts?: number;                    // default: 0 (disabled)
  delay?: number;                          // default: 1000ms
  backoff?: "fixed" | "exponential";       // default: "fixed"
  retryOn?: number[];                      // default: [408, 429, 500, 502, 503, 504]
}
```

## Caching

```ts
const api = new DriverBuilder()
  .withBaseURL("https://api.example.com")
  .withServices(services)
  .withCache({ enabled: true, ttl: 30000, getOnly: true })
  .build();
```

Only successful responses are cached. Error responses are never cached.
The cache has a max size of 1000 entries with oldest-entry eviction (in insertion order) and automatic periodic cleanup of expired entries.

```ts
interface CacheConfig {
  enabled?: boolean;   // default: false
  ttl?: number;        // default: 30000ms
  getOnly?: boolean;   // default: true
}
```

## Timeout

```ts
// Global timeout
const api = new DriverBuilder()
  .withBaseURL("https://api.example.com")
  .withServices(services)
  .withTimeout(5000)
  .build();

// Per-service timeout (overrides global)
const services: ServiceApi[] = [
  { id: "slow", url: "reports", method: MethodAPI.get, timeout: 30000 },
];
```

Timeout uses `AbortSignal.timeout()` when available (Node 17.3+, modern browsers) for automatic cleanup. Falls back to `AbortController` + `setTimeout` with `unref()` in older environments. If a `signal` is already provided in options, timeout is skipped.

## Middleware

Onion-model pipeline. Each middleware wraps the next.

```ts
import type { MiddlewareContext, MiddlewareFn } from "@tsuyoshi-otake/http-driver-optimized";

const logger: MiddlewareFn = async (ctx, next) => {
  console.log(`→ ${ctx.method.toUpperCase()} ${ctx.url}`);
  await next();
  console.log(`← ${ctx.response?.status}`);
};

const auth: MiddlewareFn = async (ctx, next) => {
  ctx.options = { ...ctx.options, headers: { Authorization: "Bearer ..." } };
  await next();
};

const api = new DriverBuilder()
  .withBaseURL("https://api.example.com")
  .withServices(services)
  .use(logger)
  .use(auth)
  .build();
```

Middleware can short-circuit by not calling `next()`. Calling `next()` multiple times is safe — the core function will only execute once.
## Observability Hooks

```ts
const api = new DriverBuilder()
  .withBaseURL("https://api.example.com")
  .withServices(services)
  .onRequest(({ url, method, serviceId, timestamp }) => {
    console.log(`[${serviceId}] ${method} ${url}`);
  })
  .onResponse(({ serviceId, status, duration, ok }) => {
    metrics.record(serviceId, { status, duration, ok });
  })
  .build();
```

## AbortController

```ts
const controller = new AbortController();
const promise = api.execService(
  { id: "posts.list" }, undefined, { signal: controller.signal }
);
controller.abort();
const res = await promise;
// res.ok === false, res.status === 408
```

Works on both Axios and Fetch paths. You can also pass `{ abortController }` and the library forwards `.signal`.

## Version Configuration

Disabled by default. Must be explicitly enabled.

```ts
// Simple
const api = new DriverBuilder()
  .withBaseURL("https://api.example.com")
  .withServices(services)
  .enableVersioning()
  .withGlobalVersion(1)
  .build();
// → https://api.example.com/v1/users

// Custom template (auto-enables versioning)
const api2 = new DriverBuilder()
  .withBaseURL("https://api.example.com")
  .withServices(services)
  .withVersionTemplate("{baseURL}/api/{version}/{endpoint}")
  .withGlobalVersion(2)
  .build();
// → https://api.example.com/api/v2/users

// Full config
const api3 = new DriverBuilder()
  .withBaseURL("https://api.example.com")
  .withServices(services)
  .withVersionConfig({
    enabled: true,
    position: "prefix",      // "after-base" | "before-endpoint" | "prefix" | "custom"
    prefix: "v",             // default: "v"
    defaultVersion: 1,
  })
  .build();
// → https://v1.api.example.com/users
```

Position strategies:
- `after-base` (default): `https://api.example.com/v1/users`
- `before-endpoint`: `https://api.example.com/v1/users` (version inserted between base and endpoint)
- `prefix`: `https://v1.api.example.com/users` (version as subdomain)
- `custom`: uses `template` string with `{baseURL}`, `{version}`, `{endpoint}` placeholders

Service-level `version` overrides the global default:

```ts
const services: ServiceApi[] = [
  { id: "users", url: "users", method: MethodAPI.get },           // uses global
  { id: "legacy", url: "old", method: MethodAPI.get, version: 1 }, // uses v1
];
```

## Transforms (Axios)

```ts
const api = new DriverBuilder()
  .withBaseURL("https://api.example.com")
  .withServices(services)
  // Sync request transform
  .withAddRequestTransformAxios((req) => {
    req.headers = { ...req.headers, "X-App": "demo" };
  })
  // Async request transform
  .withAddAsyncRequestTransformAxios((register) => {
    register(async (req) => {
      const token = await getToken();
      req.headers = { ...req.headers, Authorization: `Bearer ${token}` };
    });
  })
  // Sync response transform
  .withAddResponseTransformAxios((resp) => {
    // resp is ApiResponseLike shape
  })
  // Async response transform
  .withAddAsyncResponseTransformAxios((register) => {
    register(async (res) => { /* async work */ });
  })
  .build();
```

## Transforms (Fetch)

```ts
const api = new DriverBuilder()
  .withBaseURL("https://api.example.com")
  .withServices(services)
  .withAddRequestTransformFetch((url, requestOptions) => ({
    url: url + "?via=fetch",
    requestOptions: { ...requestOptions, headers: { ...requestOptions.headers, "X-Fetch": "1" } },
  }))
  .withAddTransformResponseFetch((response) => ({
    ...response,
    data: { wrapped: true, original: response.data },
  }))
  .build();
```

## Token Refresh Interceptor

```ts
const api = new DriverBuilder()
  .withBaseURL("https://api.example.com")
  .withServices(services)
  .withHandleInterceptorErrorAxios(
    (axiosInstance, processQueue, isRefreshing, addToQueue) => async (error) => {
      if (error?.response?.status === 401 && !isRefreshing.value) {
        isRefreshing.value = true;
        try {
          const { data } = await axiosInstance.post("/auth/refresh");
          processQueue(null, data.token);
          return axiosInstance.request(error.config);
        } catch (refreshError) {
          processQueue(refreshError, null);
          return Promise.reject(refreshError);
        } finally {
          isRefreshing.value = false;
        }
      }

      if (isRefreshing.value) {
        return new Promise((resolve, reject) => {
          addToQueue(
            (token) => { error.config.headers.Authorization = `Bearer ${token}`; resolve(axiosInstance.request(error.config)); },
            reject
          );
        });
      }

      return Promise.reject(error);
    }
  )
  .build();
```

`isRefreshing` is passed by reference (`{ value: boolean }`) so the consumer can mutate it. `addToQueue` lets you push failed requests to the internal queue, and `processQueue` resolves/rejects them all at once.

## getInfoURL

Compile a URL without making a request:

```ts
const info = api.getInfoURL(
  { id: "posts.detail", params: { id: 1 } },
  { q: "abc", page: 2 }
);
// info.fullUrl → "https://api.example.com/posts/1?q=abc&page=2"
```

## Standalone httpClientFetch

```ts
import { httpClientFetch } from "@tsuyoshi-otake/http-driver-optimized/dist/utils";
import { MethodAPI } from "@tsuyoshi-otake/http-driver-optimized";

const res = await httpClientFetch({
  url: "https://example.com/posts/{id}",
  method: MethodAPI.get,
  param: { id: "1" },
});
```

## Multipart

When `Content-Type` is `multipart/form-data`, the library removes the explicit header so the platform sets the boundary automatically. The payload is converted to FormData using bracket notation for nested objects (`parent[child]`) and arrays (`items[0]`), which is compatible with most backend frameworks (Express, Django, Rails, Spring).

During conversion, nullish plain-object properties are skipped inline instead of cloning the payload first. Primitive array values are still stringified so index-based field layout stays stable.

## SSE Streaming

Stream Server-Sent Events via Fetch ReadableStream:

```ts
const services = [
  { id: "chat.stream", url: "api/chat/completions", method: MethodAPI.post },
];

const result = await api.execServiceByStream(
  { id: "chat.stream" },
  { model: "gpt-4", messages: [{ role: "user", content: "Hello" }], stream: true }
);

if (result.ok) {
  for await (const event of result.stream) {
    // event: { event: "message", data: "...", id: "", retry?: number }
    const chunk = JSON.parse(event.data);
    process.stdout.write(chunk.choices[0].delta.content ?? "");
  }
}

// Abort anytime
result.abort();
```

Returns `StreamResponseFormat` with `stream: AsyncGenerator<SSEEvent>` and `abort()`.

## NDJSON Streaming

Stream Newline-Delimited JSON (one JSON object per line):

```ts
const services = [
  { id: "logs.stream", url: "api/logs/tail", method: MethodAPI.get },
];

const result = await api.execServiceByNDJSON<LogEntry>({ id: "logs.stream" });

if (result.ok) {
  for await (const entry of result.stream) {
    console.log(entry.timestamp, entry.message); // typed LogEntry
  }
}
```

Returns `NDJSONStreamResponseFormat<T>` with `stream: AsyncGenerator<T>` and `abort()`.

## GraphQL

Convenience wrapper over `execService` / `execServiceByFetch`:

```ts
import { createGraphQLClient } from "@tsuyoshi-otake/http-driver-optimized";

const services = [
  { id: "graphql", url: "graphql", method: MethodAPI.post },
];

const gql = createGraphQLClient(api, "graphql");

// Query
const users = await gql.query<{ users: User[] }>(`
  query($limit: Int) { users(limit: $limit) { id name } }
`, { limit: 10 });
// users.data.data.users

// Mutation
const created = await gql.mutation<{ createUser: User }>(`
  mutation($input: CreateUserInput!) { createUser(input: $input) { id name } }
`, { input: { name: "John" } });

// Use Fetch path instead of Axios
const gqlFetch = createGraphQLClient(api, "graphql", { useFetch: true });
```

## Upload & Download Progress

Standalone utilities for progress tracking with Fetch:

```ts
import { fetchWithDownloadProgress, createUploadProgressBody } from "@tsuyoshi-otake/http-driver-optimized";

// Download progress
const res = await fetch("https://example.com/large-file.zip");
const buffer = await fetchWithDownloadProgress(res, ({ loaded, total, percent }) => {
  console.log(`${percent}% (${loaded}/${total} bytes)`);
});

// Upload progress
const jsonBody = JSON.stringify(largePayload);
const { body } = createUploadProgressBody(jsonBody, ({ loaded, total, percent }) => {
  console.log(`Uploading: ${percent}%`);
});
await fetch("https://example.com/upload", { method: "POST", body });
```

`percent` is -1 when total size is unknown.
`fetchWithDownloadProgress()` returns an `ArrayBuffer`. When `Content-Length` is present, the helper preallocates a single output buffer; if the header is missing or inaccurate, it falls back safely and still returns the bytes actually read.

## WebSocket

Lightweight wrapper with auto-reconnect and typed messages:

```ts
import { createWebSocketClient } from "@tsuyoshi-otake/http-driver-optimized";

const ws = createWebSocketClient({
  url: "wss://api.example.com/ws",
  autoReconnect: true,
  maxReconnectAttempts: 5,
  reconnectDelay: 1000,
  reconnectBackoff: "exponential",
});

ws.onOpen(() => console.log("Connected"));
ws.onMessage<ChatMessage>((msg) => console.log(msg.data));
ws.onError((err) => console.error(err));
ws.onClose(() => console.log("Disconnected"));

ws.send({ type: "subscribe", channel: "updates" });
ws.close();
ws.reconnect(); // manual reconnect
console.log(ws.state); // "connecting" | "open" | "closing" | "closed"
```

## Usage with React Hooks

### SWR

```ts
import useSWR from "swr";
import type { ResponseFormat } from "@tsuyoshi-otake/http-driver-optimized";

// Generic fetcher
const axiosFetcher = <T>(idService: { id: string; params?: Record<string, string | number> }) =>
  api.execService<T>(idService).then((res) => {
    if (!res.ok) throw res;
    return res.data;
  });

// Hook
export function useUser(id: string) {
  return useSWR(
    id ? ["users.detail", id] : null,
    () => axiosFetcher<User>({ id: "users.detail", params: { id } })
  );
}

// Usage in component
function Profile({ id }: { id: string }) {
  const { data, error, isLoading } = useUser(id);
  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.problem}</p>;
  return <h1>{data?.name}</h1>;
}
```

### TanStack Query (React Query)

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await api.execService<User[]>({ id: "users.list" });
      if (!res.ok) throw res;
      return res.data;
    },
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateUserPayload) => {
      const res = await api.execService<User>({ id: "users.create" }, payload);
      if (!res.ok) throw res;
      return res.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}
```

### Custom Hook (no library)

```ts
import { useState, useEffect } from "react";
import type { ResponseFormat } from "@tsuyoshi-otake/http-driver-optimized";

export function useService<T>(
  idService: { id: string; params?: Record<string, string | number> } | null,
  payload?: Record<string, unknown>
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ResponseFormat | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!idService) return;
    let cancelled = false;
    setLoading(true);

    api.execService<T>(idService, payload).then((res) => {
      if (cancelled) return;
      if (res.ok) { setData(res.data); setError(null); }
      else { setError(res); setData(null); }
    }).finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [idService?.id, JSON.stringify(idService?.params), JSON.stringify(payload)]);

  return { data, error, loading };
}

// Usage
function UserList() {
  const { data, error, loading } = useService<User[]>({ id: "users.list" });
  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.problem}</p>;
  return <ul>{data?.map((u) => <li key={u.id}>{u.name}</li>)}</ul>;
}
```

### Vue Composable

```ts
import { ref, watchEffect } from "vue";
import type { ResponseFormat } from "@tsuyoshi-otake/http-driver-optimized";

export function useService<T>(
  idService: () => { id: string; params?: Record<string, string | number> } | null
) {
  const data = ref<T | null>(null);
  const error = ref<ResponseFormat | null>(null);
  const loading = ref(false);

  watchEffect(async () => {
    const svc = idService();
    if (!svc) return;
    loading.value = true;
    const res = await api.execService<T>(svc);
    if (res.ok) { data.value = res.data as T; error.value = null; }
    else { error.value = res; data.value = null; }
    loading.value = false;
  });

  return { data, error, loading };
}
```

## Multiple Drivers

```ts
const postsApi = new DriverBuilder()
  .withBaseURL("https://api.example.com")
  .withServices(postServices)
  .build();

const adminApi = new DriverBuilder()
  .withBaseURL("https://admin.example.com")
  .withServices(adminServices)
  .withRetry({ maxAttempts: 2 })
  .build();
```

## Service ID Convention

For maintainability and strong typing, define service IDs as an enum with a namespaced pattern: `v{version}.{domain}.{resource}.{action}`

```ts
import { MethodAPI, type ServiceApi } from "@tsuyoshi-otake/http-driver-optimized";

export enum GameServiceIds {
  List = "v1.admin.games.list",
  Store = "v1.admin.games.store",
  Detail = "v1.admin.games.detail",
  Update = "v1.admin.games.update",
  Destroy = "v1.admin.games.destroy",
  Restore = "v1.admin.games.restore",
  DownloadCSV = "v1.admin.games.download-csv",
}

export default [
  { id: GameServiceIds.List, url: "v1/admin/games", method: MethodAPI.get },
  { id: GameServiceIds.Store, url: "v1/admin/games", method: MethodAPI.post },
  { id: GameServiceIds.Detail, url: "v1/admin/games/{id}", method: MethodAPI.get },
  { id: GameServiceIds.Update, url: "v1/admin/games/{id}", method: MethodAPI.put },
  { id: GameServiceIds.Destroy, url: "v1/admin/games/{id}", method: MethodAPI.delete },
  { id: GameServiceIds.Restore, url: "v1/admin/games/{id}/restore", method: MethodAPI.patch },
  { id: GameServiceIds.DownloadCSV, url: "v1/admin/games/csv", method: MethodAPI.get },
] as ServiceApi[];
```

Usage:

```ts
const detail = await api.execService({
  id: GameServiceIds.Detail,
  params: { id: 123 },
});

const list = await api.execServiceByFetch({ id: GameServiceIds.List });
```

Benefits: type-safe IDs with auto-complete, consistent naming, easier refactors.

## API Reference

### DriverBuilder

| Method | Description |
|--------|-------------|
| `withBaseURL(url)` | Set base URL |
| `withServices(services)` | Set service definitions |
| `withRetry(config)` | Global retry config |
| `withCache(config)` | Response cache config |
| `withTimeout(ms)` | Global timeout in ms |
| `use(middleware)` | Add middleware to pipeline |
| `onRequest(hook)` | Set request observability hook |
| `onResponse(hook)` | Set response observability hook |
| `enableVersioning(enabled?)` | Enable/disable version building |
| `withGlobalVersion(version)` | Set global version |
| `withVersionConfig(config)` | Full version configuration |
| `withVersionTemplate(template)` | Set custom template (auto-enables) |
| `withAddRequestTransformAxios(fn)` | Sync Axios request transform |
| `withAddResponseTransformAxios(fn)` | Sync Axios response transform |
| `withAddAsyncRequestTransformAxios(fn)` | Async Axios request transform |
| `withAddAsyncResponseTransformAxios(fn)` | Async Axios response transform |
| `withHandleInterceptorErrorAxios(fn)` | Axios error interceptor |
| `withAddRequestTransformFetch(fn)` | Fetch request transform |
| `withAddTransformResponseFetch(fn)` | Fetch response transform |
| `build()` | Build and return driver instance |

### Driver Instance

| Method | Description |
|--------|-------------|
| `execService(idService, payload?, options?)` | Execute via Axios |
| `execServiceByFetch(idService, payload?, options?)` | Execute via Fetch |
| `execServiceByStream(idService, payload?, options?)` | SSE streaming via Fetch |
| `execServiceByNDJSON(idService, payload?, options?)` | NDJSON streaming via Fetch |
| `getInfoURL(idService, payload?)` | Compile URL without request |

The built driver also exposes all Axios instance methods (`get`, `post`, `put`, `delete`, etc.).

### Standalone Utilities

| Export | Description |
|--------|-------------|
| `createGraphQLClient(driver, serviceId, options?)` | GraphQL query/mutation helper |
| `fetchWithDownloadProgress(response, onProgress)` | Download progress tracking |
| `createUploadProgressBody(body, onProgress)` | Upload progress tracking |
| `createWebSocketClient(config)` | WebSocket with auto-reconnect |
| `parseNDJSONStream(stream, signal?)` | Raw NDJSON stream parser |

### ServiceApi

```ts
interface ServiceApi {
  id: string;
  url: string;                        // supports {param} placeholders
  method: MethodAPI;
  version?: number | string;
  options?: Record<string, unknown>;
  timeout?: number;                    // per-service timeout in ms
  retry?: RetryConfig;                 // per-service retry config
}
```

## Examples

```bash
npm run start:example
```

Entry point: `example/index.ts`

## Benchmarks

```bash
npm run bench:optimizations
npm run bench:memory
npm run bench:memory:formdata
```

- `bench:optimizations`: hot-path runtime microbenchmarks for driver execution and stream parsing
- `bench:memory`: compares legacy vs optimized download buffering for known-size and unknown-size responses
- `bench:memory:formdata`: compares legacy vs optimized multipart FormData traversal and clone overhead

## License

MIT

## Credits

Original project:
Châu Lâm Đình Ái (alvin0)
GitHub: https://github.com/alvin0

Fork maintainer:
tsuyoshi-otake
GitHub: https://github.com/tsuyoshi-otake

This repository is a maintained fork of `alvin0/http-driver`.
