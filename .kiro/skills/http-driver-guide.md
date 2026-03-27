---
name: http-driver-guide
description: Guide for using @alvin0/http-driver - a fully typed per-service HTTP client with retry, caching, dedup, middleware, and observability
---

# @alvin0/http-driver Usage Guide

You are helping a developer use the `@alvin0/http-driver` package. This is a fully typed, per-service HTTP client that wraps both Axios and Fetch with a unified `ResponseFormat<T>` shape.

## Core Concepts

### 1. DriverBuilder Pattern
Always build a driver using `DriverBuilder`. The builder is fluent — all methods return `this`.

```ts
import { DriverBuilder, MethodAPI } from "@alvin0/http-driver";
import type { ServiceApi } from "@alvin0/http-driver";

const services: ServiceApi[] = [
  { id: "users.list", url: "users", method: MethodAPI.get },
  { id: "users.detail", url: "users/{id}", method: MethodAPI.get },
  { id: "users.create", url: "users", method: MethodAPI.post },
];

const api = new DriverBuilder()
  .withBaseURL("https://api.example.com")
  .withServices(services)
  .build();
```

### 2. Two Execution Paths
- `execService<T>(idService, payload?, options?)` — uses Axios
- `execServiceByFetch<T>(idService, payload?, options?)` — uses Fetch API

Both return `Promise<ResponseFormat<T>>` with the same shape:
```ts
interface ResponseFormat<T = unknown> {
  ok: boolean;           // true if 200-299
  status: number;
  data: T;
  problem: string | null;
  originalError: string | null;
  headers?: Headers | Record<string, string> | null;
  duration: number;      // ms
}
```

### 3. Service Definition
```ts
interface ServiceApi {
  id: string;                          // unique identifier
  url: string;                         // supports {param} placeholders
  method: MethodAPI;                   // get, post, put, patch, delete, head, link, unlink
  version?: number | string;           // for version injection
  options?: Record<string, unknown>;   // default request options
  timeout?: number;                    // per-service timeout in ms
  retry?: RetryConfig;                 // per-service retry config
}
```

### 4. URL Parameters
Use `{param}` placeholders in service URLs, pass values via `params`:
```ts
// Service: { id: "users.detail", url: "users/{id}", method: MethodAPI.get }
await api.execService({ id: "users.detail", params: { id: "123" } });
// → GET https://api.example.com/users/123
```

For GET requests, payload becomes query string automatically:
```ts
await api.execService({ id: "users.list" }, { page: 1, limit: 10 });
// → GET https://api.example.com/users?page=1&limit=10
```

## Builder Methods Reference

### Essential
- `withBaseURL(url: string)` — required
- `withServices(services: ServiceApi[])` — required
- `build()` — returns `HttpDriverInstance & AxiosInstance`

### Resilience
- `withRetry({ maxAttempts, delay, backoff, retryOn })` — global retry. Per-service `retry` in ServiceApi overrides.
- `withCache({ enabled, ttl, getOnly })` — in-memory cache. Only caches successful responses.
- `withTimeout(ms)` — global timeout. Per-service `timeout` in ServiceApi overrides. Skipped if `signal` already set.

### Middleware & Observability
- `use(middleware: MiddlewareFn)` — add middleware (onion model). Can call multiple times.
- `onRequest(hook)` — called before every request with `{ url, method, serviceId, timestamp }`
- `onResponse(hook)` — called after every response with `{ url, method, serviceId, status, duration, ok }`

### Versioning
- `enableVersioning(enabled?)` — enable/disable version injection (disabled by default)
- `withGlobalVersion(version)` — default version for all services
- `withVersionConfig({ enabled, position, prefix, defaultVersion, template })` — full config
- `withVersionTemplate(template)` — custom template, auto-enables versioning

Version positions: `after-base` (default), `before-endpoint`, `prefix` (subdomain), `custom` (template).

### Axios Transforms
- `withAddRequestTransformAxios(fn)` — sync request transform
- `withAddAsyncRequestTransformAxios(registrar)` — async request transform (registrar pattern)
- `withAddResponseTransformAxios(fn)` — sync response transform
- `withAddAsyncResponseTransformAxios(registrar)` — async response transform
- `withHandleInterceptorErrorAxios(fn)` — error interceptor with `(axiosInstance, processQueue, isRefreshing, addToQueue)` signature

### Fetch Transforms
- `withAddRequestTransformFetch(fn)` — must return `{ url, requestOptions }`
- `withAddTransformResponseFetch(fn)` — receives and returns `ResponseFormat`

## Common Patterns

### Token Refresh with Queue
```ts
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
```
Key: `isRefreshing` is `{ value: boolean }` (by reference). `addToQueue` pushes to internal queue. `processQueue` resolves/rejects all queued.

### React Hook with SWR
```ts
import useSWR from "swr";

export function useUser(id: string) {
  return useSWR(
    id ? ["users.detail", id] : null,
    () => api.execService<User>({ id: "users.detail", params: { id } })
      .then(res => { if (!res.ok) throw res; return res.data; })
  );
}
```

### React Hook with TanStack Query
```ts
import { useQuery } from "@tanstack/react-query";

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

### Middleware for Logging
```ts
const logger: MiddlewareFn = async (ctx, next) => {
  console.log(`→ ${ctx.method} ${ctx.url}`);
  await next();
  console.log(`← ${ctx.response?.status} (${ctx.response?.duration}ms)`);
};
builder.use(logger);
```

### Service ID Enum Convention
```ts
export enum UserServiceIds {
  List = "v1.users.list",
  Detail = "v1.users.detail",
  Create = "v1.users.create",
}
```

### Multipart Upload
```ts
// Service with multipart Content-Type
{ id: "upload", url: "files", method: MethodAPI.post, options: { headers: { "Content-Type": "multipart/form-data" } } }

// Or pass in options
await api.execServiceByFetch({ id: "upload" }, { file: myFile }, { headers: { "Content-Type": "multipart/form-data" } });
// Library auto-removes Content-Type header so browser sets boundary
```

### AbortController
```ts
const controller = new AbortController();
const promise = api.execService({ id: "users.list" }, undefined, { signal: controller.signal });
controller.abort();
// result: { ok: false, status: 408, problem: "timeout" }
```

### getInfoURL (URL compilation without request)
```ts
const info = api.getInfoURL({ id: "users.detail", params: { id: 1 } }, { q: "search" });
// info.fullUrl → "https://api.example.com/users/1?q=search"
```

## Important Notes

1. `build()` requires both `baseURL` and at least one service, otherwise throws.
2. GET requests automatically dedup concurrent calls to the same URL.
3. Cache only stores successful (`ok: true`) responses.
4. Retry does NOT retry on 4xx (except 408, 429) by default.
5. Per-service `timeout` and `retry` override global config.
6. Version injection is DISABLED by default — must call `enableVersioning()` or use `withVersionConfig({ enabled: true })`.
7. The built driver is also a full `AxiosInstance` — you can call `api.get()`, `api.post()` etc. directly.
8. `httpClientFetch` is available as a standalone function from `@alvin0/http-driver/dist/utils` for one-off fetch calls without building a driver.
