import { DriverBuilder, MethodAPI } from "../../src/index";
import type { ServiceApi } from "../../src/types/driver";

describe("getInfoURL", () => {
  const services: ServiceApi[] = [
    { id: "user.get", url: "api/test/{id}", method: MethodAPI.get, options: {} },
    { id: "user.post", url: "api/create", method: MethodAPI.post },
    { id: "search", url: "api/search?default=true", method: MethodAPI.get },
  ];

  function buildDriver(svc = services) {
    return new DriverBuilder().withBaseURL("http://example.com").withServices(svc).build();
  }

  test("appends query string for GET with payload", () => {
    const info = buildDriver().getInfoURL({ id: "user.get", params: { id: "test" } }, { search: "query" });
    expect(info.fullUrl).toBe("http://example.com/api/test/test?search=query");
    expect(info.payload).toBeNull();
    expect(info.method).toBe("get");
  });

  test("returns null for unknown service", () => {
    const info = buildDriver().getInfoURL({ id: "nonexistent" });
    expect(info.fullUrl).toBeNull();
    expect(info.method).toBeNull();
  });

  test("handles non-GET method with payload", () => {
    const payload = { name: "test", value: 123 };
    const info = buildDriver().getInfoURL({ id: "user.post" }, payload);
    expect(info.fullUrl).toBe("http://example.com/api/create");
    expect(info.payload).toBe(payload);
    expect(info.method).toBe(MethodAPI.post);
  });

  test("handles empty payload for GET", () => {
    const info = buildDriver().getInfoURL({ id: "user.get", params: { id: "1" } }, {});
    expect(info.fullUrl).toBe("http://example.com/api/test/1");
    expect(info.payload).toEqual({});
  });

  test("handles GET with existing query string in URL", () => {
    const info = buildDriver().getInfoURL({ id: "search" }, { q: "test", page: 1 });
    expect(info.fullUrl).toContain("default=true&q=test&page=1");
    expect(info.payload).toBeNull();
  });
});
