import * as qs from "qs";
import { MethodAPI, DriverConfig } from "../../src/types/driver";
import {
  replaceParamsInUrl,
  findServiceApi,
  joinUrl,
  compileService,
  compileUrl,
  compileUrlByService,
  buildUrlWithVersion,
} from "../../src/utils/index";

describe("replaceParamsInUrl", () => {
  test("replaces placeholders with values", () => {
    expect(replaceParamsInUrl("/users/{userId}/posts/{postId}", { userId: "123", postId: "456" }))
      .toBe("/users/123/posts/456");
  });

  test("returns original url when no matching placeholders", () => {
    expect(replaceParamsInUrl("/about", { id: "123" })).toBe("/about");
  });

  test("encodes special characters in param values", () => {
    expect(replaceParamsInUrl("/users/{name}", { name: "john doe" }))
      .toBe("/users/john%20doe");
  });

  test("keeps placeholder intact when param key is missing from map", () => {
    expect(replaceParamsInUrl("/users/{userId}/posts/{postId}", { userId: "42" }))
      .toBe("/users/42/posts/{postId}");
  });
});

describe("findServiceApi", () => {
  const services = [
    { id: "1", url: "/one", method: MethodAPI.get },
    { id: "dummy", url: "/dummy/{param}", method: MethodAPI.get, options: { headers: { "Content-Type": "application/json" } } },
  ];

  test("finds a service by id", () => {
    expect(findServiceApi(services, "dummy")?.id).toBe("dummy");
  });

  test("returns null if service is not found", () => {
    expect(findServiceApi(services, "missing")).toBeNull();
  });
});

describe("joinUrl", () => {
  test("joins parts with single slash", () => {
    expect(joinUrl("https://api.example.com/", "/users")).toBe("https://api.example.com/users");
  });

  test("handles parts without slashes", () => {
    expect(joinUrl("https://api.example.com", "users")).toBe("https://api.example.com/users");
  });

  test("handles multiple trailing/leading slashes", () => {
    expect(joinUrl("https://api.example.com///", "///users")).toBe("https://api.example.com/users");
  });

  test("returns empty string for no valid parts", () => {
    expect(joinUrl(undefined, null, "")).toBe("");
  });

  test("joins three parts", () => {
    expect(joinUrl("https://api.example.com", "v1", "users")).toBe("https://api.example.com/v1/users");
  });
});

describe("compileService", () => {
  const services = [
    { id: "dummy", url: "/dummy/{param}", method: MethodAPI.get, options: { headers: { "Content-Type": "application/json" } } },
    { id: "2", url: "/two", method: MethodAPI.post },
  ];

  test("compiles service info if found", () => {
    const result = compileService({ id: "dummy", params: { param: "test" } }, services);
    expect(result).not.toBeNull();
    expect(result?.url).toBe("/dummy/test");
    expect(result?.method).toBe(MethodAPI.get);
  });

  test("returns null if service is not found", () => {
    expect(compileService({ id: "missing" }, services)).toBeNull();
  });
});

describe("compileUrl", () => {
  test("appends query string for GET method with payload", () => {
    const payload = { foo: "bar", num: "10" };
    const result = compileUrl("http://example.com/api", MethodAPI.get, payload, { custom: "header" });
    expect(result.url).toBe(`http://example.com/api?${qs.stringify(payload)}`);
    expect(result.payload).toEqual({});
    expect(result.options).toEqual({ custom: "header" });
  });

  test("keeps payload for non-GET method", () => {
    const result = compileUrl("http://example.com/api", MethodAPI.post, { foo: "bar" }, {});
    expect(result.url).toBe("http://example.com/api");
    expect(result.payload).toEqual({ foo: "bar" });
  });

  test("returns url unchanged if no payload", () => {
    const result = compileUrl("http://example.com", MethodAPI.get);
    expect(result.url).toBe("http://example.com");
    expect(result.payload).toEqual({});
  });
});

describe("compileUrlByService", () => {
  const config: DriverConfig = {
    baseURL: "http://example.com",
    services: [
      { id: "svc1", url: "api/{id}", method: MethodAPI.get, options: {} },
      { id: "svc2", url: "post/{id}", method: MethodAPI.post, options: {} },
    ],
  };

  test("compiles GET service with payload as query string", () => {
    const result = compileUrlByService(config, { id: "svc1", params: { id: "123" } }, { a: "b" });
    expect(result).not.toBeNull();
    expect(result?.url).toContain("http://example.com/api/123?a=b");
    expect(result?.payload).toEqual({});
  });

  test("compiles POST service keeping payload", () => {
    const result = compileUrlByService(config, { id: "svc2", params: { id: "456" } }, { a: "b" });
    expect(result?.url).toBe("http://example.com/post/456");
    expect(result?.payload).toEqual({ a: "b" });
  });

  test("returns null when service not found", () => {
    expect(compileUrlByService(config, { id: "unknown" })).toBeNull();
  });

  test("prevents double slashes in final URL", () => {
    const cfg: DriverConfig = {
      baseURL: "https://api.example.com/",
      services: [{ id: "login", url: "/api/v1/auth/login", method: MethodAPI.post }],
    };
    const result = compileUrlByService(cfg, { id: "login" });
    expect(result?.url).toBe("https://api.example.com/api/v1/auth/login");
  });

  test("uses version config when enabled", () => {
    const cfg: DriverConfig = {
      baseURL: "https://api.example.com",
      services: [{ id: "test", url: "test", method: MethodAPI.get }],
      versionConfig: { enabled: true, defaultVersion: "2.0", position: "after-base" },
    };
    const result = compileUrlByService(cfg, { id: "test" });
    expect(result?.url).toBe("https://api.example.com/v2.0/test");
  });
});

describe("buildUrlWithVersion", () => {
  const baseURL = "https://api.example.com";

  test("returns simple concatenation when not enabled", () => {
    expect(buildUrlWithVersion(baseURL, "users", 1, { enabled: false })).toBe("https://api.example.com/users");
  });

  test("returns simple concatenation when no version config", () => {
    expect(buildUrlWithVersion(baseURL, "users", 1)).toBe("https://api.example.com/users");
  });

  test("returns simple concatenation when no version provided", () => {
    expect(buildUrlWithVersion(baseURL, "users", undefined, { enabled: true })).toBe("https://api.example.com/users");
  });

  test("after-base position (default)", () => {
    expect(buildUrlWithVersion(baseURL, "users", 1, { enabled: true })).toBe("https://api.example.com/v1/users");
  });

  test("before-endpoint position", () => {
    expect(buildUrlWithVersion(baseURL, "users", 1, { enabled: true, position: "before-endpoint" }))
      .toBe("https://api.example.com/v1/users");
  });

  test("prefix position with protocol", () => {
    expect(buildUrlWithVersion(baseURL, "users", 1, { enabled: true, position: "prefix" }))
      .toBe("https://v1.api.example.com/users");
  });

  test("prefix position without protocol", () => {
    expect(buildUrlWithVersion("api.example.com", "users", 1, { enabled: true, position: "prefix" }))
      .toBe("v1.api.example.com/users");
  });

  test("custom template", () => {
    expect(buildUrlWithVersion(baseURL, "users", 1, {
      enabled: true, position: "custom", template: "{baseURL}/api/{version}/{endpoint}",
    })).toBe("https://api.example.com/api/v1/users");
  });

  test("throws error when custom position but no template", () => {
    expect(() => buildUrlWithVersion(baseURL, "users", 1, { enabled: true, position: "custom" }))
      .toThrow("Custom version position requires a template");
  });

  test("custom prefix", () => {
    expect(buildUrlWithVersion(baseURL, "users", 1, { enabled: true, prefix: "version" }))
      .toBe("https://api.example.com/version1/users");
  });

  test("empty prefix", () => {
    expect(buildUrlWithVersion(baseURL, "users", 1, { enabled: true, prefix: "" }))
      .toBe("https://api.example.com/1/users");
  });

  test("string version", () => {
    expect(buildUrlWithVersion(baseURL, "users", "1.2", { enabled: true }))
      .toBe("https://api.example.com/v1.2/users");
  });

  test("prevents double slashes", () => {
    expect(buildUrlWithVersion("https://api.example.com/", "/users", 1, { enabled: true, position: "after-base" }))
      .toBe("https://api.example.com/v1/users");
  });
});

describe("compileUrlByService version branches", () => {
  test("service with version overrides defaultVersion", () => {
    const cfg: DriverConfig = {
      baseURL: "https://api.example.com",
      services: [{ id: "svc", url: "endpoint", method: MethodAPI.get, version: 5 }],
      versionConfig: { enabled: true, defaultVersion: "1.0", position: "after-base" },
    };
    const result = compileUrlByService(cfg, { id: "svc" });
    expect(result?.url).toBe("https://api.example.com/v5/endpoint");
  });

  test("service without version uses defaultVersion", () => {
    const cfg: DriverConfig = {
      baseURL: "https://api.example.com",
      services: [{ id: "svc", url: "endpoint", method: MethodAPI.get }],
      versionConfig: { enabled: true, defaultVersion: "2.0", position: "after-base" },
    };
    const result = compileUrlByService(cfg, { id: "svc" });
    expect(result?.url).toBe("https://api.example.com/v2.0/endpoint");
  });
});
