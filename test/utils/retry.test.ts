import { resolveRetryConfig, withRetry } from "../../src/utils/retry";
import type { ResponseFormat } from "../../src/types/driver";

const okResponse: ResponseFormat = { ok: true, status: 200, data: "ok", problem: null, originalError: null, duration: 10 };
const errorResponse: ResponseFormat = { ok: false, status: 503, data: null, problem: "SERVER_ERROR", originalError: "err", duration: 10 };

describe("resolveRetryConfig", () => {
  test("returns defaults when no config provided", () => {
    const config = resolveRetryConfig();
    expect(config.maxAttempts).toBe(0);
    expect(config.delay).toBe(1000);
    expect(config.backoff).toBe("fixed");
    expect(config.retryOn).toEqual([408, 429, 500, 502, 503, 504]);
  });

  test("per-service overrides global", () => {
    const config = resolveRetryConfig({ maxAttempts: 2, delay: 500 }, { maxAttempts: 5 });
    expect(config.maxAttempts).toBe(5);
    expect(config.delay).toBe(500);
  });

  test("global used when per-service not provided", () => {
    const config = resolveRetryConfig({ maxAttempts: 3, backoff: "exponential" });
    expect(config.maxAttempts).toBe(3);
    expect(config.backoff).toBe("exponential");
  });
});

describe("withRetry", () => {
  test("returns immediately when maxAttempts is 0", async () => {
    const fn = jest.fn().mockResolvedValue(errorResponse);
    const result = await withRetry({ maxAttempts: 0 }, fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
  });

  test("returns on first success without retrying", async () => {
    const fn = jest.fn().mockResolvedValue(okResponse);
    const result = await withRetry({ maxAttempts: 3, delay: 1 }, fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });

  test("retries on retryable status and succeeds", async () => {
    const fn = jest.fn()
      .mockResolvedValueOnce(errorResponse)
      .mockResolvedValueOnce(okResponse);
    const result = await withRetry({ maxAttempts: 2, delay: 1 }, fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });

  test("exhausts retries and returns last error", async () => {
    const fn = jest.fn().mockResolvedValue(errorResponse);
    const result = await withRetry({ maxAttempts: 2, delay: 1 }, fn);
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    expect(result.ok).toBe(false);
  });

  test("does not retry on non-retryable status", async () => {
    const notFound: ResponseFormat = { ok: false, status: 404, data: null, problem: "NOT_FOUND", originalError: "err", duration: 10 };
    const fn = jest.fn().mockResolvedValue(notFound);
    const result = await withRetry({ maxAttempts: 3, delay: 1 }, fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(404);
  });

  test("exponential backoff increases delay", async () => {
    const fn = jest.fn().mockResolvedValue(errorResponse);
    const start = Date.now();
    await withRetry({ maxAttempts: 2, delay: 10, backoff: "exponential" }, fn);
    const elapsed = Date.now() - start;
    // delay: 10ms (attempt 0) + 20ms (attempt 1) = 30ms minimum
    expect(elapsed).toBeGreaterThanOrEqual(20);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
