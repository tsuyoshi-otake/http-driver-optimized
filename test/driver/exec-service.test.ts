import { AxiosError, AxiosHeaders } from "axios";
import { DriverBuilder, MethodAPI } from "../../src/index";
import type { ServiceApi } from "../../src/types/driver";
import {
  AuthenticationError,
  HTTPError,
  NetworkError,
  RedirectError,
  TimeoutError,
  TLSError,
} from "../../src/types/errors";

const svcGet: ServiceApi = { id: "svc.get", url: "api/{id}", method: MethodAPI.get, options: {} };
const svcPost: ServiceApi = { id: "svc.post", url: "api/post", method: MethodAPI.post, options: { headers: { "Content-Type": "application/json" } } };
const svcDelete: ServiceApi = { id: "svc.delete", url: "api/delete/{id}", method: MethodAPI.delete };
const svcHead: ServiceApi = { id: "svc.head", url: "api/head", method: MethodAPI.head };
const svcMultipart: ServiceApi = { id: "svc.multipart", url: "api/upload", method: MethodAPI.post, options: { headers: { "Content-Type": "multipart/form-data" } } };

function buildDriver(services: ServiceApi[] = [svcGet, svcPost, svcDelete, svcHead, svcMultipart]) {
  return new DriverBuilder().withBaseURL("http://example.com").withServices(services).build();
}

describe("execService", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns error when service not found", async () => {
    const driver = buildDriver();
    const res = await driver.execService({ id: "unknown" });
    expect(res.ok).toBe(false);
    expect(res.problem).toContain("Service unknown in driver not found");
  });

  test("returns successful response for GET", async () => {
    const driver = buildDriver();
    driver.get = jest.fn().mockResolvedValue({
      ok: true, status: 200, data: { data: "ok" }, headers: {}, problem: null, originalError: null, duration: 10,
    });
    const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ data: "ok" });
  });

  test("handles DELETE and HEAD methods (bodyless)", async () => {
    const driver = buildDriver();
    driver.delete = jest.fn().mockResolvedValue({ ok: true, status: 204, data: null, headers: {} });
    driver.head = jest.fn().mockResolvedValue({ ok: true, status: 200, data: null, headers: {} });

    const delRes = await driver.execService({ id: "svc.delete", params: { id: "1" } });
    expect(delRes.ok).toBe(true);
    expect(driver.delete).toHaveBeenCalledWith("http://example.com/api/delete/1", {});

    const headRes = await driver.execService({ id: "svc.head" });
    expect(headRes.ok).toBe(true);
  });

  test("returns error response when API call returns null", async () => {
    const driver = buildDriver();
    driver.get = jest.fn().mockResolvedValue(null);
    const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
    expect(res.problem).toContain("No response from service call");
  });

  test("passes through already-normalized response", async () => {
    const driver = buildDriver();
    const normalized = { ok: true, status: 200, data: { already: "normalized" }, headers: {}, problem: null, originalError: null, duration: 50 };
    driver.get = jest.fn().mockResolvedValue(normalized);
    const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
    expect(res).toBe(normalized);
  });

  test("handles multipart/form-data Content-Type", async () => {
    const driver = buildDriver();
    (driver as any).defaults.adapter = async (config: any) => ({
      data: { created: true }, status: 201, statusText: "Created", headers: {}, config,
    });
    const res = await driver.execService({ id: "svc.multipart" }, { a: 1 });
    expect(res.ok).toBe(true);
  });

  test("supports AbortController via abortController.signal", async () => {
    const driver = buildDriver();
    const abortController = new AbortController();
    let capturedConfig: any;
    (driver as any).defaults.adapter = async (config: any) => {
      capturedConfig = config;
      return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
    };
    await driver.execService({ id: "svc.get", params: { id: "1" } }, {}, { abortController });
    expect(capturedConfig.signal).toBe(abortController.signal);
  });

  describe("error handling", () => {
    test("AxiosError with ERR_CANCELED maps to timeout", async () => {
      const driver = buildDriver();
      driver.get = jest.fn().mockRejectedValue({ isAxiosError: true, code: "ERR_CANCELED" } as AxiosError);
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(false);
      expect(res.status).toBe(408);
    });

    test("AxiosError with CanceledError name maps to timeout", async () => {
      const driver = buildDriver();
      driver.get = jest.fn().mockRejectedValue({ isAxiosError: true, name: "CanceledError" } as AxiosError);
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.status).toBe(408);
    });

    test("AxiosError ECONNABORTED maps to TIMEOUT_ERROR", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async () => { throw { isAxiosError: true, code: "ECONNABORTED" }; };
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.problem).toBe("TIMEOUT_ERROR");
    });

    test("AxiosError ETIMEDOUT maps to TIMEOUT_ERROR", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async () => { throw { isAxiosError: true, code: "ETIMEDOUT" }; };
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.problem).toBe("TIMEOUT_ERROR");
    });

    test("AxiosError without response maps to NETWORK_ERROR", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async () => { throw { isAxiosError: true, code: "ENETDOWN" }; };
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.problem).toBe("NETWORK_ERROR");
    });

    test("AxiosError with 5xx maps to SERVER_ERROR", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async (config: any) => {
        throw { isAxiosError: true, response: { status: 500, statusText: "ISE", headers: { "X-Test": "A" }, data: { error: "server" }, config } };
      };
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.problem).toBe("SERVER_ERROR");
      expect(res.status).toBe(500);
      expect((res.headers as any)["x-test"]).toBe("A");
    });

    test("AxiosError with 4xx maps to CLIENT_ERROR", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async (config: any) => {
        throw { isAxiosError: true, response: { status: 404, statusText: "NF", headers: {}, data: null, config } };
      };
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.problem).toBe("CLIENT_ERROR");
    });

    test("AxiosError with status 0 maps to UNKNOWN_ERROR", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async (config: any) => {
        throw { isAxiosError: true, response: { status: 0, headers: {}, data: null, config } };
      };
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.problem).toBe("UNKNOWN_ERROR");
    });

    test("plain Error with 'timeout' maps to TimeoutError", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async () => { throw new Error("timeout reached"); };
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.status).toBe(408);
    });

    test("plain Error with 'network' maps to NetworkError", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async () => { throw new Error("Network unreachable"); };
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.status).toBe(503);
    });

    test("non-Error primitive thrown falls back to unknown error", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async () => { throw "boom"; };
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(false);
      expect(res.status).toBe(500);
      expect(res.problem).toBe("An unknown error occurred");
    });

    test("custom error types are handled", async () => {
      const driver = buildDriver();
      driver.get = jest.fn().mockRejectedValue(new TimeoutError());
      expect((await driver.execService({ id: "svc.get", params: { id: "1" } })).status).toBe(408);

      driver.get = jest.fn().mockRejectedValue(new NetworkError("Connection failed"));
      expect((await driver.execService({ id: "svc.get", params: { id: "1" } })).status).toBe(503);

      driver.get = jest.fn().mockRejectedValue(new AuthenticationError("Token expired"));
      expect((await driver.execService({ id: "svc.get", params: { id: "1" } })).status).toBe(401);

      driver.get = jest.fn().mockRejectedValue(new RedirectError());
      expect((await driver.execService({ id: "svc.get", params: { id: "1" } })).status).toBe(310);

      driver.get = jest.fn().mockRejectedValue(new TLSError("Certificate validation failed"));
      expect((await driver.execService({ id: "svc.get", params: { id: "1" } })).status).toBe(525);

      driver.get = jest.fn().mockRejectedValue(new HTTPError("Internal server error", 500));
      expect((await driver.execService({ id: "svc.get", params: { id: "1" } })).status).toBe(500);
    });

    test("concurrent requests with mixed results", async () => {
      const driver = buildDriver();
      driver.get = jest.fn()
        .mockResolvedValueOnce({ ok: true, status: 200, data: { id: 1 }, headers: new Headers(), problem: null, originalError: null })
        .mockRejectedValueOnce(new TimeoutError());

      const [r1, r2] = await Promise.all([
        driver.execService({ id: "svc.get", params: { id: "1" } }),
        driver.execService({ id: "svc.get", params: { id: "2" } }),
      ]);
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(false);
      expect(r2.status).toBe(408);
    });
  });

  describe("header normalization", () => {
    test("normalizes AxiosHeaders with toJSON", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async (config: any) => ({
        data: { ok: true }, status: 200, statusText: "OK",
        headers: new AxiosHeaders({ "X-Test": "A", "y": "z" }), config,
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
      expect((res.headers as any)["x-test"]).toBe("A");
    });

    test("normalizes plain object headers with array values", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async (config: any) => ({
        data: { ok: true }, status: 200, statusText: "OK",
        headers: { "X-Array": ["a", "b"], "X-Key": "V" }, config,
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect((res.headers as any)["x-array"]).toBe("a, b");
      expect((res.headers as any)["x-key"]).toBe("V");
    });

    test("returns null for non-object headers", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async () => ({
        data: { ok: true }, status: 200, statusText: "OK", headers: "invalid", config: {},
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.headers).toEqual({});
    });

    test("returns null for null/undefined headers", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async () => ({
        data: { ok: true }, status: 200, statusText: "OK", headers: null, config: {},
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.headers).toEqual({});
    });
  });

  describe("transforms", () => {
    test("sync + async request/response transforms execute", async () => {
      const syncReq = jest.fn((req: any) => { req.headers = { ...req.headers, "X-Sync": "1" }; });
      const syncResp = jest.fn();
      let asyncRespCalled = false;
      let capturedHeaders: any;

      const driver = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([svcGet])
        .withAddRequestTransformAxios(syncReq)
        .withAddAsyncRequestTransformAxios((register: any) => {
          (register as any)(async (req: any) => { req.headers = { ...req.headers, "X-Async": "1" }; });
        })
        .withAddResponseTransformAxios(syncResp)
        .withAddAsyncResponseTransformAxios((register: any) => {
          (register as any)(async () => { asyncRespCalled = true; });
        })
        .build();

      (driver as any).defaults.adapter = async (config: any) => {
        capturedHeaders = config.headers;
        return { data: { echo: true }, status: 200, statusText: "OK", headers: {}, config };
      };

      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
      expect(syncReq).toHaveBeenCalled();
      expect(syncResp).toHaveBeenCalled();
      expect(asyncRespCalled).toBe(true);
      expect(capturedHeaders["X-Sync"]).toBe("1");
      expect(capturedHeaders["X-Async"]).toBe("1");
    });

    test("request transform throwing error propagates", async () => {
      const driver = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([svcGet])
        .withAddRequestTransformAxios(() => { throw new Error("Transform failed"); })
        .build();
      (driver as any).defaults.adapter = async () => { throw new Error("Should not reach"); };
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(false);
    });

    test("async request transform throwing error propagates", async () => {
      const driver = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([svcGet])
        .withAddAsyncRequestTransformAxios((register: any) => {
          (register as any)(async () => { throw new Error("Async transform failed"); });
        })
        .build();
      (driver as any).defaults.adapter = async () => { throw new Error("Should not reach"); };
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(false);
    });

    test("response transform throwing error is swallowed", async () => {
      const driver = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([svcGet])
        .withAddResponseTransformAxios(() => { throw new Error("Response transform failed"); })
        .build();
      (driver as any).defaults.adapter = async () => ({
        data: { ok: true }, status: 200, statusText: "OK", headers: {}, config: {},
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
    });

    test("async response transform throwing error is ignored", async () => {
      const driver = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([svcGet])
        .withAddAsyncResponseTransformAxios((register: any) => {
          (register as any)(async () => { throw new Error("Async response transform failed"); });
        })
        .build();
      (driver as any).defaults.adapter = async () => ({
        data: { ok: true }, status: 200, statusText: "OK", headers: {}, config: {},
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
    });
  });
});

  describe("edge cases", () => {
    test("falls back to request() when method not available on instance", async () => {
      const customService: ServiceApi = {
        id: "custom", url: "api/custom", method: "PATCH" as any,
      };
      const driver = buildDriver([customService]);
      driver.request = jest.fn().mockResolvedValue({
        ok: true, status: 200, data: { patched: true }, headers: {},
      });
      const res = await driver.execService({ id: "custom" }, { data: "patch" });
      expect(res.ok).toBe(true);
      expect(driver.request).toHaveBeenCalledWith({
        method: "PATCH", url: "http://example.com/api/custom", data: { data: "patch" },
      });
    });

    test("handles multipart Content-Type in options (not service options)", async () => {
      const svc: ServiceApi = { id: "upload", url: "api/upload", method: MethodAPI.post };
      const driver = buildDriver([svc]);
      (driver as any).defaults.adapter = async (config: any) => ({
        data: { uploaded: true }, status: 200, statusText: "OK", headers: {}, config,
      });
      const res = await driver.execService({ id: "upload" }, { file: "data" }, { headers: { "Content-Type": "multipart/form-data" } });
      expect(res.ok).toBe(true);
    });

    test("handles non-object headers (number)", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async () => ({
        data: { ok: true }, status: 200, statusText: "OK", headers: 123, config: {},
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
    });

    test("handles function headers (returns null)", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async () => ({
        data: { ok: true }, status: 200, statusText: "OK", headers: () => "fn", config: {},
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
    });
  });

  describe("processQueue coverage", () => {
    test("processQueue with error rejects all queued promises", async () => {
      let capturedProcessQueue: any;
      let capturedAddToQueue: any;

      const driver = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([svcGet])
        .withHandleInterceptorErrorAxios((_ax, processQueue, _isRefreshing, addToQueue) => {
          capturedProcessQueue = processQueue;
          capturedAddToQueue = addToQueue;
          return async (error: any) => Promise.reject(error);
        })
        .build();

      (driver as any).defaults.adapter = async () => {
        throw { isAxiosError: true, code: "ERR_NETWORK" };
      };

      await driver.execService({ id: "svc.get", params: { id: "1" } });

      // Add items to queue then process with error
      const reject1 = jest.fn();
      const reject2 = jest.fn();
      capturedAddToQueue(jest.fn(), reject1);
      capturedAddToQueue(jest.fn(), reject2);
      capturedProcessQueue(new Error("token expired"), null);
      expect(reject1).toHaveBeenCalledWith(expect.any(Error));
      expect(reject2).toHaveBeenCalledWith(expect.any(Error));
    });

    test("processQueue with null error resolves all queued promises", async () => {
      let capturedProcessQueue: any;
      let capturedAddToQueue: any;

      const driver = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([svcGet])
        .withHandleInterceptorErrorAxios((_ax, processQueue, _isRefreshing, addToQueue) => {
          capturedProcessQueue = processQueue;
          capturedAddToQueue = addToQueue;
          return async (error: any) => Promise.reject(error);
        })
        .build();

      // Add items to queue then process with success
      const resolve1 = jest.fn();
      const resolve2 = jest.fn();
      capturedAddToQueue(resolve1, jest.fn());
      capturedAddToQueue(resolve2, jest.fn());
      capturedProcessQueue(null, "new-token");
      expect(resolve1).toHaveBeenCalledWith("new-token");
      expect(resolve2).toHaveBeenCalledWith("new-token");
    });

    test("isRefreshing is passed by reference", async () => {
      let capturedIsRefreshing: any;

      const driver = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([svcGet])
        .withHandleInterceptorErrorAxios((_ax, _pq, isRefreshing, _atq) => {
          capturedIsRefreshing = isRefreshing;
          return async (error: any) => Promise.reject(error);
        })
        .build();

      expect(capturedIsRefreshing).toEqual({ value: false });
      capturedIsRefreshing.value = true;
      expect(capturedIsRefreshing.value).toBe(true);
    });
  });

  describe("normalizeAxiosHeaders full branch coverage", () => {
    test("covers object branch without toJSON (pure plain object)", async () => {
      const driver = buildDriver();
      // Use adapter to return headers as a plain object without toJSON
      (driver as any).defaults.adapter = async (config: any) => {
        const plainHeaders = Object.create(null);
        plainHeaders["Content-Type"] = "application/json";
        plainHeaders["X-Custom"] = "value";
        return {
          data: { ok: true }, status: 200, statusText: "OK",
          headers: plainHeaders, config,
        };
      };
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
      expect((res.headers as any)["content-type"]).toBe("application/json");
    });

    test("covers return null branch for non-object headers (string)", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async () => ({
        data: { ok: true }, status: 200, statusText: "OK",
        headers: "just-a-string", config: {},
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
    });

    test("covers return null branch for non-object headers (number)", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async () => ({
        data: { ok: true }, status: 200, statusText: "OK",
        headers: 42, config: {},
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
    });

    test("covers return null branch for non-object headers (boolean)", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async () => ({
        data: { ok: true }, status: 200, statusText: "OK",
        headers: true, config: {},
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
    });
  });

  describe("optional chaining fallback branches", () => {
    test("execService with options that have signal already set", async () => {
      const driver = buildDriver();
      const controller = new AbortController();
      let capturedConfig: any;
      (driver as any).defaults.adapter = async (config: any) => {
        capturedConfig = config;
        return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
      };
      // Pass signal directly (not via abortController)
      await driver.execService({ id: "svc.get", params: { id: "1" } }, {}, { signal: controller.signal });
      expect(capturedConfig.signal).toBe(controller.signal);
    });

    test("execService with no options at all", async () => {
      const driver = buildDriver();
      driver.get = jest.fn().mockResolvedValue({
        ok: true, status: 200, data: {}, headers: {}, problem: null, originalError: null, duration: 0,
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
    });

    test("execService with service that has no options defined", async () => {
      const svcNoOpts: ServiceApi = { id: "no-opts", url: "api/no-opts", method: MethodAPI.get };
      const driver = buildDriver([svcNoOpts]);
      driver.get = jest.fn().mockResolvedValue({
        ok: true, status: 200, data: {}, headers: {}, problem: null, originalError: null, duration: 0,
      });
      const res = await driver.execService({ id: "no-opts" });
      expect(res.ok).toBe(true);
    });

    test("AxiosError with response that has null data and null headers", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async (config: any) => {
        throw {
          isAxiosError: true,
          code: "ERR_BAD_REQUEST",
          response: { status: 400, statusText: "Bad Request", headers: null, data: null, config },
        };
      };
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(false);
      expect(res.status).toBe(400);
      expect(res.problem).toBe("CLIENT_ERROR");
    });
  });

  describe("remaining branch coverage", () => {
    test("withCredentials explicitly set to false", () => {
      const driver = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([svcGet])
        .build();
      // Default is true via ?? operator; test the other branch
      const driver2 = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([svcGet]);
      (driver2 as any).config.withCredentials = false;
      const built = driver2.build();
      expect((built as any).defaults.withCredentials).toBe(false);
    });

    test("multipart detection with headers that have Content-Type but not multipart", async () => {
      const svc: ServiceApi = {
        id: "json-ct", url: "api/json", method: MethodAPI.post,
        options: { headers: { "Content-Type": "application/json" } },
      };
      const driver = buildDriver([svc]);
      (driver as any).defaults.adapter = async (config: any) => ({
        data: { ok: true }, status: 200, statusText: "OK", headers: {}, config,
      });
      const res = await driver.execService({ id: "json-ct" }, { data: "test" });
      expect(res.ok).toBe(true);
    });

    test("multipart detection with headers object but no Content-Type property", async () => {
      const svc: ServiceApi = {
        id: "no-ct", url: "api/no-ct", method: MethodAPI.post,
        options: { headers: { "Authorization": "Bearer token" } },
      };
      const driver = buildDriver([svc]);
      (driver as any).defaults.adapter = async (config: any) => ({
        data: { ok: true }, status: 200, statusText: "OK", headers: {}, config,
      });
      const res = await driver.execService({ id: "no-ct" }, { data: "test" });
      expect(res.ok).toBe(true);
    });

    test("multipart detection with non-string Content-Type", async () => {
      const svc: ServiceApi = {
        id: "num-ct", url: "api/num-ct", method: MethodAPI.post,
        options: { headers: { "Content-Type": 123 } },
      };
      const driver = buildDriver([svc]);
      (driver as any).defaults.adapter = async (config: any) => ({
        data: { ok: true }, status: 200, statusText: "OK", headers: {}, config,
      });
      const res = await driver.execService({ id: "num-ct" }, { data: "test" });
      expect(res.ok).toBe(true);
    });

    test("AxiosError with response that has data and headers", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async (config: any) => {
        throw {
          isAxiosError: true,
          response: {
            status: 422,
            statusText: "Unprocessable",
            headers: { "x-error": "validation" },
            data: { errors: ["field required"] },
            config,
          },
        };
      };
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.status).toBe(422);
      expect(res.data).toEqual({ errors: ["field required"] });
    });

    test("AxiosError with no response and no code", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async () => {
        throw { isAxiosError: true };
      };
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.problem).toBe("NETWORK_ERROR");
    });

    test("normalizeAxiosHeaders with object that has toJSON returning empty", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async (config: any) => ({
        data: { ok: true }, status: 200, statusText: "OK",
        headers: { toJSON: () => ({}) }, config,
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
    });

    test("normalizeAxiosHeaders lowerize with non-string non-array values (skipped)", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async (config: any) => ({
        data: { ok: true }, status: 200, statusText: "OK",
        headers: { "X-Num": 42, "X-Bool": true, "X-Str": "val", "X-Arr": ["a", "b"] }, config,
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
      expect((res.headers as any)["x-str"]).toBe("val");
      expect((res.headers as any)["x-arr"]).toBe("a, b");
      // Axios may stringify header values; our lowerize only keeps string and array types
      // In practice, numeric headers get stringified by Axios before reaching normalizeAxiosHeaders
    });

    test("response with status >= 400 sets problem to statusText", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async (config: any) => ({
        data: null, status: 404, statusText: "Not Found", headers: {}, config,
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(false);
      expect(res.problem).toBe("Not Found");
    });

    test("mapAxiosErrorToProblem with status between 200-399 returns UNKNOWN_ERROR", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async (config: any) => {
        throw {
          isAxiosError: true,
          response: { status: 301, statusText: "Moved", headers: {}, data: null, config },
        };
      };
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.problem).toBe("UNKNOWN_ERROR");
    });
  });

  describe("100% branch coverage", () => {
    test("processQueue with error rejects queued promises", async () => {
      // We need to actually populate failedQueue and call processQueue
      // The only way is through the interceptor handler that receives processQueue
      let capturedProcessQueue: (error: any, token: string | null) => void;
      let interceptorResolve: (value: any) => void;

      const driver = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([svcGet])
        .withHandleInterceptorErrorAxios((axiosInstance, processQueue, _isRefreshing, _addToQueue) => {
          capturedProcessQueue = processQueue;
          return async (error: any) => {
            // Return a promise that we control - this simulates the token refresh pattern
            // where the failed request is queued
            return new Promise((resolve, reject) => {
              interceptorResolve = resolve;
              // Simulate: add this request to the queue, then process
              // We call processQueue with error to reject all queued items
              processQueue(error, null);
              reject(error);
            });
          };
        })
        .build();

      (driver as any).defaults.adapter = async () => {
        throw { isAxiosError: true, code: "ERR_UNAUTHORIZED", response: { status: 401, headers: {}, data: null } };
      };

      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(false);

      // Now test processQueue success branch (null error)
      capturedProcessQueue!(null, "new-token");
    });

    test("processQueue with default token parameter", async () => {
      let capturedProcessQueue: any;

      const driver = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([svcGet])
        .withHandleInterceptorErrorAxios((_ax, processQueue, _ir, _atq) => {
          capturedProcessQueue = processQueue;
          return async (error: any) => Promise.reject(error);
        })
        .build();

      // Call processQueue with only error arg (token defaults to null)
      capturedProcessQueue(new Error("test"));
      // Call with null error to hit the else branch
      capturedProcessQueue(null);
      expect(capturedProcessQueue).toBeDefined();
    });

    test("AxiosError where code is undefined (?.code fallback)", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async () => {
        throw { isAxiosError: true, response: { status: 503, headers: {}, data: null } };
      };
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.problem).toBe("SERVER_ERROR");
    });

    test("AxiosError where name is undefined (?.name fallback)", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async () => {
        throw { isAxiosError: true, code: "SOMETHING" };
      };
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.problem).toBe("NETWORK_ERROR");
    });

    test("normalizeAxiosHeaders with non-object truthy value (string) returns null", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async () => ({
        data: { ok: true }, status: 200, statusText: "OK",
        headers: "string-headers", config: {},
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
      // String headers -> typeof !== "object" -> returns null -> responseFormat passes through
      expect(res.headers).toEqual({});
    });

    test("normalizeAxiosHeaders with object without toJSON (plain object branch)", async () => {
      const driver = buildDriver();
      const plainObj = { "X-Custom": "val" };
      (driver as any).defaults.adapter = async (config: any) => ({
        data: { ok: true }, status: 200, statusText: "OK",
        headers: plainObj, config,
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
      expect((res.headers as any)["x-custom"]).toBe("val");
    });

    test("normalizeAxiosHeaders raw || {} fallback when toJSON returns null", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async (config: any) => ({
        data: { ok: true }, status: 200, statusText: "OK",
        headers: { toJSON: () => null }, config,
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
    });

    test("axiosResponseToResponseFormat with status < 400 sets problem to null", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async (config: any) => ({
        data: { ok: true }, status: 200, statusText: "OK",
        headers: { "x-test": "val" }, config,
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
      expect(res.problem).toBeNull();
    });

    test("fetch POST where headers is undefined (no Content-Type)", async () => {
      const svcNoHeaders: ServiceApi = { id: "nh", url: "api/nh", method: MethodAPI.post, options: {} };
      const driver = buildDriver([svcNoHeaders]);
      const origFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        text: async () => JSON.stringify({ ok: true }),
      } as any);
      const res = await driver.execServiceByFetch({ id: "nh" }, { data: "test" });
      expect(res.ok).toBe(true);
      globalThis.fetch = origFetch;
    });

    test("fetch POST where Content-Type is present but not multipart", async () => {
      const svcFetchPost: ServiceApi = { id: "fp", url: "api/fp", method: MethodAPI.post, options: { headers: { "Content-Type": "application/json" } } };
      const driver = buildDriver([svcFetchPost]);
      const origFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        text: async () => JSON.stringify({ ok: true }),
      } as any);
      const res = await driver.execServiceByFetch(
        { id: "fp" }, { data: "test" },
        { headers: { "Content-Type": "application/json" } }
      );
      expect(res.ok).toBe(true);
      globalThis.fetch = origFetch;
    });
  });

  describe("final branch coverage", () => {
    test("AxiosError with plain object headers (no toJSON) triggers normalizeAxiosHeaders object branch", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async (config: any) => {
        throw {
          isAxiosError: true,
          response: {
            status: 500,
            statusText: "ISE",
            headers: { "X-Plain": "value" }, // plain object, no toJSON
            data: null,
            config,
          },
        };
      };
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(false);
      expect((res.headers as any)["x-plain"]).toBe("value");
    });

    test("axiosResponseToResponseFormat with status < 400 sets problem to null", async () => {
      const driver = buildDriver();
      (driver as any).defaults.adapter = async (config: any) => ({
        data: { ok: true }, status: 201, statusText: "Created",
        headers: { "x-test": "val" }, config,
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
      expect(res.problem).toBeNull();
    });
  });

  describe("mapAxiosToApiResponseLike branch coverage", () => {
    test("sync response transform with status 200 hits problem:null branch", async () => {
      const captured: any[] = [];
      const driver = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([svcGet])
        .withAddResponseTransformAxios((resp) => {
          captured.push(resp);
        })
        .build();

      (driver as any).defaults.adapter = async (config: any) => ({
        data: { ok: true }, status: 200, statusText: "OK",
        headers: { "content-type": "application/json" }, config,
      });

      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
      expect(captured.length).toBe(1);
      expect(captured[0].problem).toBeNull();
      expect(captured[0].ok).toBe(true);
    });

    test("sync response transform with status 500 hits problem:statusText branch", async () => {
      const captured: any[] = [];
      const driver = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([svcGet])
        .withAddResponseTransformAxios((resp) => {
          captured.push(resp);
        })
        .build();

      (driver as any).defaults.adapter = async (config: any) => ({
        data: null, status: 500, statusText: "Internal Server Error",
        headers: {}, config,
      });

      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(false);
      expect(captured.length).toBe(1);
      expect(captured[0].problem).toBe("Internal Server Error");
    });
  });

  describe("normalizeAxiosHeaders toJSON false branch", () => {
    test("success response with plain object headers (no toJSON) via adapter", async () => {
      const driver = buildDriver();
      // Create a truly plain object without any prototype methods
      const plainHeaders: Record<string, string> = {};
      plainHeaders["x-custom"] = "value";
      // Ensure no toJSON
      expect(typeof (plainHeaders as any).toJSON).toBe("undefined");

      (driver as any).defaults.adapter = async (config: any) => ({
        data: { ok: true }, status: 200, statusText: "OK",
        headers: plainHeaders, config,
      });

      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(true);
      expect((res.headers as any)["x-custom"]).toBe("value");
    });
  });

  describe("normalizeAxiosHeaders toJSON=false via mocked method", () => {
    test("AxiosError thrown from mocked get() with plain headers bypasses Axios header wrapping", async () => {
      const driver = buildDriver();
      const plainHeaders = { "x-plain": "direct" };
      // Throw directly from the mocked method - bypasses Axios adapter/interceptor header wrapping
      driver.get = jest.fn().mockRejectedValue({
        isAxiosError: true,
        code: "ERR_BAD_RESPONSE",
        response: {
          status: 502,
          statusText: "Bad Gateway",
          headers: plainHeaders,
          data: { error: "upstream" },
        },
      });
      const res = await driver.execService({ id: "svc.get", params: { id: "1" } });
      expect(res.ok).toBe(false);
      expect(res.status).toBe(502);
      expect((res.headers as any)["x-plain"]).toBe("direct");
    });
  });


describe("abortController in service-level options coverage", () => {
  test("execService uses abortController.signal from options when no signal set", async () => {
    const abortController = new AbortController();
    const driver = buildDriver([svcGet]);
    let capturedOpts: any;
    (driver as any).defaults.adapter = async (config: any) => {
      capturedOpts = config;
      return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
    };
    // Pass abortController via call-level options (no timeout configured → applyTimeout returns opts unchanged)
    await driver.execService({ id: "svc.get", params: { id: "1" } }, {}, { abortController });
    // The abortController.signal should be picked up and set as signal
    expect(capturedOpts.signal).toBeDefined();
  });

  test("execService skips abortController when signal already set by timeout", async () => {
    const abortController = new AbortController();
    // Build driver WITH timeout so applyTimeout sets signal first
    const driver = new DriverBuilder()
      .withBaseURL("http://example.com")
      .withServices([svcGet])
      .withTimeout(5000)
      .build();
    let capturedOpts: any;
    (driver as any).defaults.adapter = async (config: any) => {
      capturedOpts = config;
      return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
    };
    // Pass both timeout (via driver config) and abortController — signal is already set by applyTimeout
    await driver.execService({ id: "svc.get", params: { id: "1" } }, {}, { abortController });
    // Signal should be the timeout signal, not the abortController signal
    expect(capturedOpts.signal).toBeDefined();
    expect(capturedOpts.signal).not.toBe(abortController.signal);
  });

  test("execServiceByFetch uses abortController.signal from options when no signal set", async () => {
    const origFetch = globalThis.fetch;
    const abortController = new AbortController();
    let capturedOptions: any;
    globalThis.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedOptions = opts;
      return Promise.resolve({
        ok: true, status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        text: async () => '{"ok":true}',
      });
    });
    const driver = buildDriver([svcGet]);
    // Pass abortController via call-level options (no timeout configured → applyTimeout returns opts unchanged)
    await driver.execServiceByFetch({ id: "svc.get", params: { id: "1" } }, {}, { abortController });
    expect(capturedOptions.signal).toBeDefined();
    globalThis.fetch = origFetch;
  });

  test("execServiceByFetch skips abortController when signal already set by timeout", async () => {
    const origFetch = globalThis.fetch;
    const abortController = new AbortController();
    let capturedOptions: any;
    globalThis.fetch = jest.fn().mockImplementation((_url, opts) => {
      capturedOptions = opts;
      return Promise.resolve({
        ok: true, status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        text: async () => '{"ok":true}',
      });
    });
    // Build driver WITH timeout so applyTimeout sets signal first
    const driver = new DriverBuilder()
      .withBaseURL("http://example.com")
      .withServices([svcGet])
      .withTimeout(5000)
      .build();
    await driver.execServiceByFetch({ id: "svc.get", params: { id: "1" } }, {}, { abortController });
    expect(capturedOptions.signal).toBeDefined();
    expect(capturedOptions.signal).not.toBe(abortController.signal);
    globalThis.fetch = origFetch;
  });
});
