# Active Context — HttpDriver

This file tracks the current focus, recent changes, decisions, next steps, and active considerations for the HttpDriver project.

## Current Focus
- **COMPLETED**: Added repeatable benchmark harness for hot-path measurements
- **COMPLETED**: Added repeatable memory benchmark harness for download buffering
- **COMPLETED**: Added repeatable memory benchmark harness for multipart payload conversion
- **COMPLETED**: Optimized runtime service lookup and request compilation
- **COMPLETED**: Optimized shared cache/dedup request-key generation
- **COMPLETED**: Optimized SSE and NDJSON parsers for long-line chunking
- **COMPLETED**: Reduced known-length download buffering in `fetchWithDownloadProgress()`
- **COMPLETED**: Removed eager payload cloning from `objectToFormData()`
- Continue monitoring for any new issues and maintain high test coverage
- All 416 tests now pass successfully with 100% coverage

## Recent Changes
- **Multipart FormData Memory Optimization (COMPLETED)**:
  - Added [`bench/memory-formdata.cjs`](../bench/memory-formdata.cjs)
  - Added `npm run bench:memory:formdata` in [`package.json`](../package.json)
  - [`objectToFormData()`](../src/utils/index.ts) now skips nullish object properties inline instead of cloning the full payload with `removeNullValues()` first
  - The inline traversal preserves existing array-origin behavior for backward compatibility while removing the eager sanitized-payload copy
  - Added coverage in [`test/utils/response.test.ts`](../test/utils/response.test.ts) for inherited enumerable keys and inline nullish removal behavior
  - Measured results (`220` groups, `8` items per group):
    - `legacy.objectToFormData`: `3.76ms` avg, `0.4 MiB` intermediate clone
    - `optimized.objectToFormData`: `1.62ms` avg, `0 MiB` intermediate clone

- **Download Progress Memory Optimization (COMPLETED)**:
  - Added [`bench/memory-progress.cjs`](../bench/memory-progress.cjs)
  - Added `npm run bench:memory` in [`package.json`](../package.json)
  - [`fetchWithDownloadProgress()`](../src/utils/progress.ts) now preallocates a single `Uint8Array` when `Content-Length` is known
  - If the header is smaller than the actual payload, the implementation falls back to chunk accumulation to preserve correctness
  - If the header is larger than the actual payload, the result is trimmed to the bytes actually read
  - Added coverage in [`test/utils/progress.test.ts`](../test/utils/progress.test.ts) for underreported and overreported `Content-Length`
  - Measured results (`32 MiB` response, `64 KiB` chunks):
    - `legacy.known-length`: `64 MiB` peak buffered, `27.18ms` avg
    - `optimized.known-length`: `32 MiB` peak buffered, `20.57ms` avg
    - `legacy.unknown-length`: `64 MiB` peak buffered, `19.96ms` avg
    - `optimized.unknown-length`: `64 MiB` peak buffered, `22.47ms` avg

- **Repository Relocation / Rename (COMPLETED)**:
  - GitHub repo was moved to `tsuyoshi-otake/http-driver-optimized`
  - Local `origin` now points to `https://github.com/tsuyoshi-otake/http-driver-optimized.git`
  - [`package.json`](../package.json) repository, bugs, and homepage URLs now target the renamed repo
  - NPM package name remains `@alvin0/http-driver` to avoid an unrequested breaking publish-name change

- **Performance Optimization Cycle (COMPLETED)**:
  - **Benchmark Harness**:
    - Added [`bench/optimizations.cjs`](../bench/optimizations.cjs)
    - Added `npm run bench:optimizations` in [`package.json`](../package.json)
    - Benchmarks cover `driver.getInfoURL`, `driver.execService`, `driver.execServiceByFetch`, `parseNDJSONStream.long-line`, and `parseSSEStream.long-line`
  - **Service Lookup Optimization**:
    - Added internal `serviceIndex: Map<string, ServiceApi>` in [`src/index.ts`](../src/index.ts)
    - Driver runtime now resolves services through a map-backed private resolver instead of repeated linear scans
    - Axios/fetch/stream paths now compile service info and request info once per call
  - **Shared Request Key Optimization**:
    - Added [`src/utils/request-key.ts`](../src/utils/request-key.ts)
    - [`src/utils/cache.ts`](../src/utils/cache.ts) and [`src/utils/dedup.ts`](../src/utils/dedup.ts) now share the same request-key builder
    - Driver cache/dedup paths now reuse a single computed key per request
    - GET request identity now relies on the compiled URL and skips redundant payload serialization
  - **Streaming Parser Optimization**:
    - [`src/utils/ndjson-parser.ts`](../src/utils/ndjson-parser.ts) now scans newline positions incrementally instead of splitting the full buffer every chunk
    - [`src/utils/sse-parser.ts`](../src/utils/sse-parser.ts) now uses the same incremental scan approach
  - **Measured Results**:
    - Baseline:
      - `driver.getInfoURL`: 414.75us avg
      - `driver.execService`: 540.78us avg
      - `driver.execServiceByFetch`: 589.41us avg
    - After current optimizations:
      - `driver.getInfoURL`: 397.02us avg
      - `driver.execService`: 398.70us avg
      - `driver.execServiceByFetch`: 407.97us avg
      - `parseNDJSONStream.long-line`: 171.43us avg (from 189.10us)
      - `parseSSEStream.long-line`: 158.72us avg (from 190.84us)

- **Double Slash Prevention (COMPLETED)**:
  - **Problem**: URLs were being compiled with double slashes (e.g., `https://api.example.com//users`) when concatenating parts
  - **Solution**: 
    - Created `joinUrl` utility in [`src/utils/index.ts`](../src/utils/index.ts) that handles safe slash normalization
    - Updated `compileUrlByService` and `buildUrlWithVersion` in [`src/utils/index.ts`](../src/utils/index.ts) to use `joinUrl`
    - Updated `getInfoURL` in [`src/index.ts`](../src/index.ts) to use `joinUrl`
  - **Tests**: Added comprehensive test suite in [`test/src/utils/double-slash.test.ts`](../test/src/utils/double-slash.test.ts) covering:
    - Base URL + endpoint concatenation
    - Version injection scenarios
    - Edge cases with trailing/leading slashes

- **Generic Type System Fix (COMPLETED)**:
  - **Problem**: `ResponseFormat<T>` interface was generic but method signatures always returned `ResponseFormat` (defaulting to `any`)
  - **Solution**: Updated `HttpDriverInstance` interface and method implementations to support generic types:
    - Changed `execService: (...) => Promise<ResponseFormat>` to `execService: <T = any>(...) => Promise<ResponseFormat<T>>`
    - Changed `execServiceByFetch: (...) => Promise<ResponseFormat>` to `execServiceByFetch: <T = any>(...) => Promise<ResponseFormat<T>>`
    - Updated `responseFormat()` utility function to be generic: `responseFormat<T = any>(...): ResponseFormat<T>`
    - Updated `httpClientFetch()` to be generic: `httpClientFetch<T = any>(...): Promise<ResponseFormat<T>>`
    - Fixed type casting issues in utility functions with proper generic type assertions
  - **Usage**: Now consumers can specify response types: `driver.execService<User>({id: 'getUser'})`
  - **Backward Compatibility**: All existing code continues to work (defaults to `any` when no type specified)
  - **Tests**: All 185 tests pass, created demonstration example at [`example/generic-types-demo.ts`](../example/generic-types-demo.ts)

- **Test Fixes (COMPLETED)**:
  - **Fixed Empty Test File**: Updated [`test/type-inference.test.ts`](../test/type-inference.test.ts) with proper type inference tests
  - **Enhanced Fetch Response Handling**: Significantly improved [`execServiceByFetch`](../src/index.ts) to support multiple response types:
    - **Explicit responseType Support**: `blob`, `arraybuffer`, `text` options now work correctly
    - **Auto-detection Based on Content-Type**: 
      - Images (`image/*`) and PDFs (`application/pdf`) automatically handled as blobs
      - Text content-types (`text/*`) handled as text when appropriate
      - JSON content-types parsed as JSON with fallback to text
      - `application/octet-stream` handled as blob unless explicit responseType specified
    - **Prioritized Logic**: Explicit `responseType` now takes precedence over content-type auto-detection
    - **Backward Compatibility**: All existing JSON handling preserved
  - **Test Results**: All 185 tests now pass with 97.76% statement coverage

- **Version Ignore Fix (COMPLETED)**:
  - Fixed issue where service-specific versions were not properly ignored when versioning was disabled
  - Updated both `getInfoURL()` and `compileUrlByService()` to completely ignore service versions when `versionConfig.enabled` is false
  - Added clarifying comments: "ignore any service versions" when versioning is disabled
  - Verified fix with comprehensive testing showing:
    - Service `{ version: 1 }` without `.enableVersioning()` → URL: `baseURL/endpoint` (version ignored ✅)
    - Same service with `.enableVersioning()` → URL: `baseURL/v1/endpoint` (version used ✅) 
    - Service + global versions both ignored when versioning disabled ✅

- **Version Configuration System (COMPLETED)**:
  - Added `VersionConfig` interface in [`src/types/driver.ts`](../src/types/driver.ts)
  - Implemented `buildUrlWithVersion()` utility function in [`src/utils/index.ts`](../src/utils/index.ts)
  - Updated `compileUrlByService()` to use version injection logic
  - Modified `getInfoURL()` method to support versioned URLs
  - Added builder methods `withVersionConfig()` and `withGlobalVersion()`
  - Created comprehensive examples in [`example/src/app/version-examples.ts`](../example/src/app/version-examples.ts)
  - Added complete test coverage for version functionality
  - Created detailed documentation at [`docs/version-configuration.md`](../docs/version-configuration.md)

- **Node.js 18.x Compatibility Fix**:
  - Fixed `File` and `Blob` type compatibility issues in test environment 
  - Added comprehensive mocks for `File`, `Blob`, and `FormData` in [`test/src/utils/missing-coverage.test.ts`](../test/src/utils/missing-coverage.test.ts)
  - **Replaced `instanceof File` with safe detection function in production code**:
    - Created `isFileOrBlobObject()` helper function in [`src/utils/index.ts`](../src/utils/index.ts)
    - Handles both File-like and Blob-like objects without relying on global constructors
    - Compatible with browser environments, Node.js polyfills, and custom mocks
    - Supports detection via constructor names, object properties, and method signatures
  - All tests now pass with 97%+ coverage
  - Solution handles Node.js environments that don't have native browser APIs

- Memory Bank core docs:
  - Brief: [`memory-bank/projectbrief.md`](./projectbrief.md)
  - Product: [`memory-bank/productContext.md`](./productContext.md)
  - Patterns: [`memory-bank/systemPatterns.md`](./systemPatterns.md)
  - Tech: [`memory-bank/techContext.md`](./techContext.md)
- Reviewed primary source files:
  - Entry/Builder: [`src/index.ts`](../src/index.ts)
  - Contracts: [`src/utils/driver-contracts.ts`](../src/utils/driver-contracts.ts)
  - Utilities: [`src/utils/index.ts`](../src/utils/index.ts)
  - Errors: [`src/utils/custom-errors.ts`](../src/utils/custom-errors.ts), [`src/utils/error-handler.ts`](../src/utils/error-handler.ts)

## Important Patterns and Preferences
- Standard response shape for all calls via [`ResponseFormat`](../src/utils/driver-contracts.ts:95) and formatter [`responseFormat()`](../src/utils/index.ts:112).
- Services are declarative with templated URLs; resolution goes through [`compileService()`](../src/utils/index.ts:57) and [`compileUrlByService()`](../src/utils/index.ts:84).
- Runtime driver execution should use the internal service map in [`src/index.ts`](../src/index.ts) rather than repeated scans through the service array.
- Dual execution paths:
  - Axios: [`execService()`](../src/index.ts:109)
  - Fetch: [`execServiceByFetch()`](../src/index.ts:164)
- Body shaping guided by content type via [`compileBodyFetchWithContextType()`](../src/utils/index.ts:182).
- **URL Safety**: Always use `joinUrl` from [`src/utils/index.ts`](../src/utils/index.ts) when concatenating URL parts to prevent double slashes.
- Request identity should go through [`src/utils/request-key.ts`](../src/utils/request-key.ts) so cache/dedup behavior stays aligned.
- Performance-sensitive changes should be checked with [`bench/optimizations.cjs`](../bench/optimizations.cjs) before and after the patch.
- Memory-sensitive download changes should be checked with [`bench/memory-progress.cjs`](../bench/memory-progress.cjs), especially for known-size responses.
- Memory-sensitive multipart changes should be checked with [`bench/memory-formdata.cjs`](../bench/memory-formdata.cjs) before and after the patch.

## Decisions and Open Issues

1) Async transform naming mismatch
- Observed
  - In [`src/index.ts`](../src/index.ts), the constructor checks `config.addAsyncRequestTransformAxios` and `config.addAsyncTransformResponseAxios`.
  - The contract defines `addAsyncRequestTransform` / `addAsyncResponseTransform` in [`interface DriverConfig`](../src/utils/driver-contracts.ts:34).
  - Builder setters [`withAddAsyncRequestTransformAxios()`](../src/index.ts:321) and [`withAddAsyncResponseTransformAxios()`](../src/index.ts:329) currently assign to the non-axios-suffixed names in `DriverConfig`.
- Impact
  - Async hooks likely never invoked.
- Decision
  - Update `Driver` to use `config.addAsyncRequestTransform` and `config.addAsyncResponseTransform` (align to contract).
- Follow-up
  - Add tests asserting async hooks invocation.

2) Axios response casting vs normalization
- Observed
  - [`execService()`](../src/index.ts:109) returns `result as ResponseFormat`, where `result` is `ApiResponse` from apisauce.
- Risk
  - Type shape differences (e.g., headers) and invariants may diverge from [`ResponseFormat`](../src/utils/driver-contracts.ts:95).
- Decision
  - Map `ApiResponse` -> [`ResponseFormat`](../src/utils/driver-contracts.ts:95) via explicit adapter + [`responseFormat()`](../src/utils/index.ts:112), ensuring duration, problem, originalError fields are coherent.

3) Fetch JSON strictness
- Observed
  - In [`execServiceByFetch()`](../src/index.ts:164), the response text is parsed as JSON; failure throws [`MalformedResponseError`](../src/utils/custom-errors.ts:35) even when HTTP OK.
- Trade-off
  - Strict JSON contracts are good for typed APIs but break text/binary endpoints.
- Decision
  - Keep strict behavior for now but document this and potentially gate with a config flag later (e.g., `strictJsonFetch?: boolean`). Consumers can also override via [`withAddTransformResponseFetch()`](../src/index.ts:365).

4) getInfoURL method check literal
- Observed
  - [`getInfoURL()`](../src/index.ts:274) checks `apiInfo.methods === "get"`.
- Decision
  - Replace with `apiInfo.methods === MethodAPI.get` for correctness and refactor-safety. Reference: [`enum MethodAPI`](../src/utils/driver-contracts.ts:3).

5) Error normalization flow
- Observed
  - Errors route through [`handleErrorResponse()`](../src/utils/error-handler.ts:41) returning a ResponseFormat-like object, then wrapped again by [`responseFormat()`](../src/utils/index.ts:112).
- Decision
  - This is redundant but harmless; keep for now. Consider a single normalization step later for clarity/perf.

## Next Steps (Implementation Plan)
- Hook alignment
  - Update `Driver` constructor to use:
    - `config.addAsyncRequestTransform` inside `addAsyncRequestTransform(...)`
    - `config.addAsyncResponseTransform` inside `addAsyncResponseTransform(...)`
  - Add tests to validate async hooks are invoked.
- Axios adapter
  - Implement an adapter mapping apisauce `ApiResponse` to [`ResponseFormat`](../src/utils/driver-contracts.ts:95) in [`execService()`](../src/index.ts:109).
  - Preserve `duration`, `status`, `data`, and map axios headers appropriately (or omit headers for axios path if incompatible).
- Minor corrections
  - Use `MethodAPI.get` in [`getInfoURL()`](../src/index.ts:274).
- Optional enhancement
  - Consider lazy-expiration or an expiry queue for [`ResponseCache`](../src/utils/cache.ts) to avoid periodic full-map scans.
  - Consider a streaming download API alongside [`fetchWithDownloadProgress()`](../src/utils/progress.ts) to avoid buffering large responses twice.
  - Consider `strictJsonFetch` flag in config for [`execServiceByFetch()`](../src/index.ts:164) to optionally allow text payloads without error (fall back to text when JSON.parse fails).

## Testing Additions
- Async hooks
  - Verify both async request/response transforms fire for axios path.
- Axios mapping
  - Ensure response shape matches [`ResponseFormat`](../src/utils/driver-contracts.ts:95) including `ok` logic, `problem`, `originalError`.
- FormData compiler
  - Arrays of primitives, arrays of objects, nested objects, and `File` instances.
- Parity checks
  - For identical successful endpoints, axios and fetch produce compatible `ok`, `status`, and `data` semantics.

## Notes, Constraints, Considerations
- Node vs Browser
  - Fetch in Node requires Node 18+ or a polyfill; document in tech context. See [`memory-bank/techContext.md`](./techContext.md).
- Credentials default
  - Axios is initialized with `withCredentials: true` in [`new Driver(config)`](../src/index.ts:39).
- Example drivers
  - Refer to JSONPlaceholder and DummyJSON examples under `example/src/api-clients/` for manual testing of both paths.

## Open Questions
- Should we expose a `headers` adapter for axios to align to `Headers` semantics, or omit headers for axios path in [`ResponseFormat`](../src/utils/driver-contracts.ts:95)?
- Do we want a configurable parse strategy for fetch (e.g., try JSON, else text) as default instead of strict JSON?

## Work Log Snapshot
- 2025-08-16
  - Initialized Memory Bank and documented core/system/tech contexts.
  - Identified async transform naming mismatch and FormData array handling bug.
  - Planned adapter for axios responses to ensure strict [`ResponseFormat`](../src/utils/driver-contracts.ts:95) compliance.
- 2026-04-13
  - Added `bench/optimizations.cjs` and `npm run bench:optimizations`.
  - Reworked runtime service resolution to use an internal service map and single-pass request compilation.
  - Added shared request-key helpers and reused request identities across cache/dedup paths.
  - Reworked NDJSON/SSE parsers to incrementally scan for newlines instead of splitting the whole buffer each chunk.
  - Added `bench/memory-progress.cjs` and `npm run bench:memory`.
  - Reworked `fetchWithDownloadProgress()` to preallocate known-size download buffers and fall back safely when `Content-Length` is inaccurate.
  - Added `bench/memory-formdata.cjs` and `npm run bench:memory:formdata`.
  - Reworked `objectToFormData()` to skip nullish object properties inline instead of cloning the sanitized payload first.
  - Verified the repo at 416/416 tests passing with 100% coverage.

## Reference Index
- Builder and driver surface:
  - [`class DriverBuilder`](../src/index.ts:305)
  - [`execService()`](../src/index.ts:109) · [`execServiceByFetch()`](../src/index.ts:164) · [`getInfoURL()`](../src/index.ts:274)
- Utilities:
  - [`compileUrlByService()`](../src/utils/index.ts:84) · [`compileUrl()`](../src/utils/index.ts:146)
  - [`responseFormat()`](../src/utils/index.ts:112) · [`httpClientFetch()`](../src/utils/index.ts:204)
  - [`replaceParamsInUrl()`](../src/utils/index.ts:21) · [`compileBodyFetchWithContextType()`](../src/utils/index.ts:182)
- Contracts:
  - [`MethodAPI`](../src/utils/driver-contracts.ts:3) · [`ServiceApi`](../src/utils/driver-contracts.ts:14) · [`ServiceUrlCompile`](../src/utils/driver-contracts.ts:23) · [`ResponseFormat`](../src/utils/driver-contracts.ts:95)
- Errors:
  - [`src/utils/error-handler.ts`](../src/utils/error-handler.ts) · [`src/utils/custom-errors.ts`](../src/utils/custom-errors.ts)
