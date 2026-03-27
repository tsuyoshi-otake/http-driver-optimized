import {
  AuthenticationError,
  HTTPError,
  MalformedResponseError,
  NetworkError,
  RedirectError,
  TimeoutError,
  TLSError,
} from "../../src/types/errors";
import {
  handleErrorResponse,
  isEmptyResponse,
  isMalformedResponse,
  normalizeError,
} from "../../src/utils/error-handler";

describe("normalizeError", () => {
  test("normalizes HTTPError with status and data", () => {
    const res = normalizeError(new HTTPError("boom", 418, { details: "teapot" }));
    expect(res).toMatchObject({ ok: false, status: 418, problem: "boom", data: { details: "teapot" } });
  });

  test("normalizes generic Error to 500", () => {
    const res = normalizeError(new Error("generic"));
    expect(res).toMatchObject({ ok: false, status: 500, problem: "generic" });
  });

  test("normalizes unknown to 500 with stringified originalError", () => {
    const res = normalizeError(123 as any);
    expect(res).toMatchObject({ ok: false, status: 500, problem: "An unknown error occurred", originalError: "123" });
  });

  test("HTTPError without status uses 500 fallback", () => {
    const res = normalizeError(new HTTPError("custom without status"));
    expect(res.status).toBe(500);
  });
});

describe("handleErrorResponse", () => {
  const errorTypes = [
    new AuthenticationError("auth"),
    new TimeoutError("timeout"),
    new NetworkError("net"),
    new RedirectError("redir"),
    new TLSError("tls"),
    new MalformedResponseError("mal"),
    new Error("plain"),
  ];

  test("maps all error classes through normalizeError", () => {
    for (const err of errorTypes) {
      const res = handleErrorResponse(err);
      expect(res.ok).toBe(false);
      expect(res.problem).toBeDefined();
      expect(res.status).toBeGreaterThan(0);
    }
  });
});

describe("isMalformedResponse", () => {
  test("returns true for falsy values", () => {
    expect(isMalformedResponse("")).toBe(true);
    expect(isMalformedResponse(null)).toBe(true);
    expect(isMalformedResponse(undefined)).toBe(true);
  });

  test("returns false for valid JSON string", () => {
    expect(isMalformedResponse(JSON.stringify({ a: 1 }))).toBe(false);
  });

  test("returns true for invalid JSON string", () => {
    expect(isMalformedResponse("{oops")).toBe(true);
  });

  test("returns false for non-string non-empty input", () => {
    expect(isMalformedResponse({})).toBe(false);
    expect(isMalformedResponse(123)).toBe(false);
  });
});

describe("isEmptyResponse", () => {
  test("detects empty", () => {
    expect(isEmptyResponse("")).toBe(true);
    expect(isEmptyResponse(null)).toBe(true);
    expect(isEmptyResponse(undefined)).toBe(true);
  });

  test("detects non-empty", () => {
    expect(isEmptyResponse(" ")).toBe(false);
    expect(isEmptyResponse(0)).toBe(false);
    expect(isEmptyResponse({})).toBe(false);
  });
});
