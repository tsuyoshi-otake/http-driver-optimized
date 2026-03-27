---
name: http-driver
description: >
  Guide for using @alvin0/http-driver — a fully typed per-service HTTP client
  for Axios and Fetch with retry, caching, deduplication, middleware, and
  observability. Use when the developer asks about http-driver, building API
  clients, configuring services, setting up retry/cache/timeout, writing
  middleware, token refresh interceptors, or integrating with React hooks
  (SWR, TanStack Query).
---

# @alvin0/http-driver

Fully typed, per-service HTTP client wrapping Axios and Fetch with a unified `ResponseFormat<T>`.

## When to Use

Activate this skill when the user:
- Asks how to set up or configure `@alvin0/http-driver`
- Needs to define services, build a driver, or make API calls
- Wants to add retry, caching, timeout, middleware, or observability
- Is implementing token refresh with request queuing
- Wants to integrate with React (SWR, TanStack Query, custom hooks) or Vue
- Asks about versioned API URLs, multipart uploads, or AbortController

## Core Architecture

```
ServiceApi[] → DriverBuilder → Driver (HttpDriverInstance & AxiosInstance)
                                 ├── execService<T>()        (Axios path)
                                 ├── execServiceByFetch<T>()  (Fetch path)
                                 └── getInfoURL()             (URL compilation)
```

Every call returns `ResponseFormat<T>`:
```ts
interface ResponseFormat<T = unknown> {
  ok: boolean;           // true if status 200-299
  status: number;
  data: T;
  problem: string | null;
  originalError: string | null;
  headers?: Headers | Record<string, string> | null;
  duration: number;      // ms
}
```

## Step-by-Step Setup

### 1. Define Services

```ts
import { MethodAPI, type ServiceApi } from "@alvin0/http-driver";

const services: ServiceApi[] = [
  { id: "users.list", url: "users", method: MethodAPI.get },
  { id: "users.detail", url: "users/{id}", method: MethodAPI.get },
  { id: "users.create", url: "users", method: MethodAPI.post },
];
```

`ServiceApi` fields:
- `id` (string) — unique identifier
- `url` (string) — supports `{param}` placeholders
- `method` (MethodAPI) — get, post, put, patch, delete, head, link, unlink
- `version?` — for URL version injection
- `timeout?` (number) — per-service timeout in ms
- `retry?` (RetryConfig) — per-service retry, overrides global
- `options?` — default request options

### 2. Build a Driver

```ts
import { DriverBuilder } from "@alvin0/http-driver";

const api = new DriverBuilder()
  .withBaseURL("https://api.example.com")
  .withServices(services)
  .build();
```

`build()` requires both `baseURL` and at least one service.

### 3. Make Requests

```ts
// Axios path
const res = await api.execService<User[]>({ id: "users.list" });

// Fetch path
const res = await api.execServiceByFetch<User>(
  { id: "users.detail", params: { id: "1" } }
);

// GET payload → query string automatically
await api.execService({ id: "users.list" }, { page: 1, limit: 10 });
// → GET /users?page=1&limit=10

// POST payload → request body
await api.execService({ id: "users.create" }, { name: "John", email: "j@x.com" });
```

## Builder Methods

### Resilience
```ts
.withRetry({ maxAttempts: 3, delay: 1000, backoff: "exponential", retryOn: [408, 429, 500, 502, 503, 504] })
.withCache({ enabled: true, ttl: 30000, getOnly: true })
.withTimeout(5000)  // global timeout in ms
```

- Retry: per-service `retry` in ServiceApi overrides global
- Cache: only caches successful (`ok: true`) GET responses
- Timeout: creates AbortController internally, skipped if `signal` already set
- GET requests are automatically deduplicated (concurrent same-URL calls share one request)

### Middleware (onion model)
```ts
import type { MiddlewareFn } from "@alvin0/http-driver";

const logger: MiddlewareFn = async (ctx, next) => {
  console.log(`→ ${ctx.method} ${ctx.url}`);
  await next();
  console.log(`← ${ctx.response?.status}`);
};

builder.use(logger);
```

Middleware can short-circuit by not calling `next()`.

### Observability
```ts
builder
  .onRequest(({ url, method, serviceId, timestamp }) => { /* log */ })
  .onResponse(({ serviceId, status, duration, ok }) => { /* metrics */ });
```

### Versioning (disabled by default)
```ts
// Simple
builder.enableVersioning().withGlobalVersion(1);
// → /v1/users

// Custom template (auto-enables)
builder.withVersionTemplate("{baseURL}/api/{version}/{endpoint}");
// → /api/v1/users

// Full config
builder.withVersionConfig({
  enabled: true,
  position: "prefix",  // "after-base" | "before-endpoint" | "prefix" | "custom"
  prefix: "v",
  defaultVersion: 1,
});
// → https://v1.api.example.com/users
```

Service-level `version` overrides global.

### Axios Transforms
```ts
// Sync
builder.withAddRequestTransformAxios((req) => { req.headers = { ...req.headers, "X-App": "demo" }; });
builder.withAddResponseTransformAxios((resp) => { /* ApiResponseLike shape */ });

// Async (registrar pattern)
builder.withAddAsyncRequestTransformAxios((register) => {
  register(async (req) => { req.headers.Authorization = `Bearer ${await getToken()}`; });
});
builder.withAddAsyncResponseTransformAxios((register) => {
  register(async (res) => { /* async work */ });
});
```

### Fetch Transforms
```ts
builder.withAddRequestTransformFetch((url, opts) => ({
  url: url + "?via=fetch",
  requestOptions: { ...opts, headers: { ...opts.headers, "X-Fetch": "1" } },
}));
builder.withAddTransformResponseFetch((response) => ({
  ...response, data: { wrapped: true, original: response.data },
}));
```

### Token Refresh Interceptor
```ts
builder.withHandleInterceptorErrorAxios(
  (axiosInstance, processQueue, isRefreshing, addToQueue) => async (error) => {
    if (error?.response?.status === 401 && !isRefreshing.value) {
      isRefreshing.value = true;
      try {
        const { data } = await axiosInstance.post("/auth/refresh");
        processQueue(null, data.token);       // resolve all queued
        return axiosInstance.request(error.config);
      } catch (refreshError) {
        processQueue(refreshError, null);      // reject all queued
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
);
```

Key: `isRefreshing` is `{ value: boolean }` (by reference). `addToQueue` pushes to internal queue. `processQueue` resolves/rejects all at once.

## React / Vue Integration

### SWR
```ts
export function useUser(id: string) {
  return useSWR(
    id ? ["users.detail", id] : null,
    () => api.execService<User>({ id: "users.detail", params: { id } })
      .then(res => { if (!res.ok) throw res; return res.data; })
  );
}
```

### TanStack Query
```ts
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
```

### Custom React Hook
```ts
export function useService<T>(idService: { id: string; params?: Record<string, string | number> } | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ResponseFormat | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!idService) return;
    let cancelled = false;
    setLoading(true);
    api.execService<T>(idService).then(res => {
      if (cancelled) return;
      res.ok ? (setData(res.data), setError(null)) : (setError(res), setData(null));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [idService?.id, JSON.stringify(idService?.params)]);

  return { data, error, loading };
}
```

## AbortController
```ts
const controller = new AbortController();
const promise = api.execService({ id: "users.list" }, undefined, { signal: controller.signal });
controller.abort();
// → { ok: false, status: 408, problem: "timeout" }
```

## Multipart Upload
```ts
// Set Content-Type to multipart/form-data — library removes header so browser sets boundary
await api.execServiceByFetch(
  { id: "upload" }, { file: myFile },
  { headers: { "Content-Type": "multipart/form-data" } }
);
```

## Service ID Convention
Use enum with namespaced pattern `v{version}.{domain}.{resource}.{action}`:
```ts
export enum UserServiceIds {
  List = "v1.users.list",
  Detail = "v1.users.detail",
  Create = "v1.users.create",
}
```

## Common Mistakes

1. Forgetting `enableVersioning()` — version in ServiceApi is ignored by default
2. Not checking `res.ok` — the library never throws on HTTP errors, always returns ResponseFormat
3. Using `any` for generics — use `execService<User>()` for type safety
4. Setting `Content-Type: multipart/form-data` manually on Axios path — Axios handles it automatically with FormData
5. Not passing `params` for URL placeholders — `{id}` in URL requires `params: { id: "123" }`

## Validation

The setup is correct when:
- `build()` does not throw
- `execService` / `execServiceByFetch` returns `ResponseFormat` with `ok: true` for successful calls
- URL placeholders are replaced correctly (check with `getInfoURL`)
- Retry fires on configured status codes (check with `onResponse` hook)
- Cache returns same response object on second identical GET call
