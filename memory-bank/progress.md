# Progress — HttpDriver

Updated: 2026-04-13

## Current Status Summary
- **ALL TESTS PASSING**: 412 tests pass with 100% coverage
- **BENCHMARK HARNESS ADDED**: `npm run bench:optimizations` measures driver and stream hot paths
- **PERFORMANCE IMPROVEMENTS SHIPPED**:
  - Runtime service lookup uses a map-backed resolver
  - Cache/dedup paths reuse a shared request key
  - NDJSON/SSE parsers use incremental newline scanning
- Memory Bank initialized: project brief, product, system patterns, tech context, and active context are in place.
- Docs: [`projectbrief.md`](./projectbrief.md), [`productContext.md`](./productContext.md), [`systemPatterns.md`](./systemPatterns.md), [`techContext.md`](./techContext.md), [`activeContext.md`](./activeContext.md)
- Core code reviewed: [`src/index.ts`](../src/index.ts), [`src/utils/index.ts`](../src/utils/index.ts), [`src/utils/driver-contracts.ts`](../src/utils/driver-contracts.ts), [`src/utils/error-handler.ts`](../src/utils/error-handler.ts), [`src/utils/custom-errors.ts`](../src/utils/custom-errors.ts)
- **Recent fixes**: Enhanced fetch response handling, fixed empty test files, achieved high test coverage

## What Works
- Driver construction via [`class DriverBuilder`](../src/index.ts:305) producing a client with: [`execService()`](../src/index.ts:109), [`execServiceByFetch()`](../src/index.ts:164), [`getInfoURL()`](../src/index.ts:274).
- Runtime service resolution no longer recompiles the same service multiple times per request.
- Cache and dedup now share the same request identity helper via [`src/utils/request-key.ts`](../src/utils/request-key.ts).
- Long-line streaming parsers avoid `split("\n")` on every chunk in [`src/utils/ndjson-parser.ts`](../src/utils/ndjson-parser.ts) and [`src/utils/sse-parser.ts`](../src/utils/sse-parser.ts).
- **Enhanced `execServiceByFetch()`** with comprehensive response type support:
  - Explicit responseType options: `'blob'`, `'arraybuffer'`, `'text'`
  - Auto-detection based on Content-Type headers
  - Prioritized logic: explicit responseType > content-type detection > JSON fallback
  - Full backward compatibility maintained
- URL and request compilation: [`compileService()`](../src/utils/index.ts:57), [`compileUrlByService()`](../src/utils/index.ts:84), [`compileUrl()`](../src/utils/index.ts:146), [`replaceParamsInUrl()`](../src/utils/index.ts:21).
- Standard response shaping: [`interface ResponseFormat`](../src/utils/driver-contracts.ts:95) with [`responseFormat()`](../src/utils/index.ts:112).
- Fetch path features: body shaping via [`compileBodyFetchWithContextType()`](../src/utils/index.ts:182), timing and JSON parsing in [`execServiceByFetch()`](../src/index.ts:164), error normalization through [`handleErrorResponse()`](../src/utils/error-handler.ts:41) and [`class MalformedResponseError`](../src/utils/custom-errors.ts:35).
- Standalone helper for non-driver fetch: [`httpClientFetch()`](../src/utils/index.ts:204).
- Examples available under [`example/`](../example) with drivers in [`example/src/api-clients/`](../example/src/api-clients).
- **Comprehensive version configuration system** with multiple positioning strategies and custom templates
- Repeatable microbenchmarks live in [`bench/optimizations.cjs`](../bench/optimizations.cjs)

## What's Left To Build / Improve (Future Considerations)
1) Optional: Align async Axios transform hooks
- Update constructor in [`src/index.ts`](../src/index.ts) to reference [`addAsyncRequestTransform`](../src/utils/driver-contracts.ts:40) and [`addAsyncResponseTransform`](../src/utils/driver-contracts.ts:41) instead of `addAsyncRequestTransformAxios`/`addAsyncTransformResponseAxios`.
- Verify builder methods [`withAddAsyncRequestTransformAxios()`](../src/index.ts:321) and [`withAddAsyncResponseTransformAxios()`](../src/index.ts:329) wire to those fields; add tests.

2) Optional: Normalize Axios responses to ResponseFormat
- In [`execService()`](../src/index.ts:109), adapt apisauce ApiResponse via [`responseFormat()`](../src/utils/index.ts:112) rather than casting.

3) Optional: Fix FormData array handling
- In [`objectToFormData()`](../src/utils/index.ts:325), use subValue when appending array entries; ensure nested arrays/objects are handled.

4) Optional: Method enum comparison in getInfoURL
- Replace string literal 'get' with [`MethodAPI.get`](../src/utils/driver-contracts.ts:3) check inside [`getInfoURL()`](../src/index.ts:274).

5) Optional: make Fetch JSON strictness configurable
- Consider flag strictJsonFetch in [`interface DriverConfig`](../src/utils/driver-contracts.ts:34) to permit text responses; or recommend [`withAddTransformResponseFetch()`](../src/index.ts:365) to relax parsing.

6) Optional: reduce cache cleanup background work
- [`ResponseCache`](../src/utils/cache.ts) still performs TTL-driven full-map cleanup scans.

7) Optional: reduce memory use for large download progress tracking
- [`fetchWithDownloadProgress()`](../src/utils/progress.ts) still buffers chunks before a final contiguous copy.

## Current Issues
- **RESOLVED**: All major test failures have been fixed
- **RESOLVED**: Empty test file issue fixed
- **RESOLVED**: Blob/ArrayBuffer/Text response handling in fetch
- **RESOLVED**: Repeated service lookup/compilation in runtime paths
- **RESOLVED**: Duplicate request-key serialization across cache/dedup checks
- **RESOLVED**: Per-chunk full-buffer splitting in SSE/NDJSON parsers

## Recent Decisions
- Prioritize explicit responseType over content-type auto-detection in fetch responses
- Maintain full backward compatibility for JSON responses
- Keep strict JSON in Fetch for now; document override via [`withAddTransformResponseFetch()`](../src/index.ts:365).
- Plan explicit Axios->ResponseFormat adapter.
- Benchmark hot-path changes before and after each optimization.
- Keep public helper behavior stable while optimizing runtime-only code paths behind the `Driver` class.

## Next Actions
- **COMPLETED**: All test failures have been resolved
- **COMPLETED**: Enhanced fetch response type handling
- **COMPLETED**: Added benchmark harness and landed first round of performance optimizations
- Monitor for any new issues or feature requests
- Consider implementing optional improvements listed above if needed
- Code: Update [`getInfoURL()`](../src/index.ts:274) to use [`MethodAPI.get`](../src/utils/driver-contracts.ts:3).
- Tests: Add coverage for async hooks, adapter mapping, and FormData edge cases in [`test/src/index.test.ts`](../test/src/index.test.ts), [`test/src/utils/index.test.ts`](../test/src/utils/index.test.ts), [`test/src/utils/httpClientFetch.test.ts`](../test/src/utils/httpClientFetch.test.ts).

## Benchmark Snapshot
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

## Test & Coverage Snapshot
- Existing tests: [`test/src/index.test.ts`](../test/src/index.test.ts), [`test/src/utils/index.test.ts`](../test/src/utils/index.test.ts), [`test/src/utils/httpClientFetch.test.ts`](../test/src/utils/httpClientFetch.test.ts), [`test/src/utils/additional.test.ts`](../test/src/utils/additional.test.ts), [`test/src/utils/extra.test.ts`](../test/src/utils/extra.test.ts).
- Target: maintain 90%+ coverage as per [`README.MD`](../README.MD).

## Reference Index
- Entry/Builder: [`src/index.ts`](../src/index.ts)
- Contracts: [`src/utils/driver-contracts.ts`](../src/utils/driver-contracts.ts)
- Utilities: [`src/utils/index.ts`](../src/utils/index.ts)
- Errors: [`src/utils/error-handler.ts`](../src/utils/error-handler.ts), [`src/utils/custom-errors.ts`](../src/utils/custom-errors.ts)
- Examples: [`example/`](../example)
