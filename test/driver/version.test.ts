import { DriverBuilder, MethodAPI } from "../../src/index";
import type { ServiceApi } from "../../src/types/driver";

describe("Version Configuration Integration", () => {
  const services: ServiceApi[] = [
    { id: "user.list", url: "users", method: MethodAPI.get },
    { id: "user.detail", url: "users/{id}", method: MethodAPI.get, version: 2 },
    { id: "post.list", url: "posts", method: MethodAPI.get, version: "1.2" },
  ];

  test("applies global version to services without specific version", () => {
    const driver = new DriverBuilder()
      .withBaseURL("https://api.example.com").withServices(services)
      .withGlobalVersion(1).enableVersioning().build();
    expect(driver.getInfoURL({ id: "user.list" }).fullUrl).toBe("https://api.example.com/v1/users");
  });

  test("service-specific version overrides global version", () => {
    const driver = new DriverBuilder()
      .withBaseURL("https://api.example.com").withServices(services)
      .withGlobalVersion(1).enableVersioning().build();
    expect(driver.getInfoURL({ id: "user.detail", params: { id: 123 } }).fullUrl)
      .toBe("https://api.example.com/v2/users/123");
  });

  test("handles string versions", () => {
    const driver = new DriverBuilder()
      .withBaseURL("https://api.example.com").withServices(services)
      .withGlobalVersion(1).enableVersioning().build();
    expect(driver.getInfoURL({ id: "post.list" }).fullUrl).toBe("https://api.example.com/v1.2/posts");
  });

  test("custom version configuration", () => {
    const driver = new DriverBuilder()
      .withBaseURL("https://api.example.com").withServices(services)
      .withVersionConfig({ enabled: true, position: "custom", template: "{baseURL}/api/{version}/{endpoint}", defaultVersion: 1 })
      .build();
    expect(driver.getInfoURL({ id: "user.list" }).fullUrl).toBe("https://api.example.com/api/v1/users");
  });

  test("before-endpoint position", () => {
    const driver = new DriverBuilder()
      .withBaseURL("https://api.example.com").withServices(services)
      .withVersionConfig({ enabled: true, position: "before-endpoint", defaultVersion: 1 })
      .build();
    expect(driver.getInfoURL({ id: "user.list" }).fullUrl).toBe("https://api.example.com/users/v1");
  });

  test("subdomain versioning", () => {
    const driver = new DriverBuilder()
      .withBaseURL("https://api.example.com").withServices(services)
      .withVersionConfig({ enabled: true, position: "prefix", defaultVersion: 1 })
      .build();
    expect(driver.getInfoURL({ id: "user.list" }).fullUrl).toBe("https://v1.api.example.com/users");
  });

  test("no version prefix", () => {
    const driver = new DriverBuilder()
      .withBaseURL("https://api.example.com").withServices(services)
      .withVersionConfig({ enabled: true, prefix: "", defaultVersion: 1 })
      .build();
    expect(driver.getInfoURL({ id: "user.list" }).fullUrl).toBe("https://api.example.com/1/users");
  });

  test("preserves query parameters with versioning", () => {
    const driver = new DriverBuilder()
      .withBaseURL("https://api.example.com").withServices(services)
      .withGlobalVersion(1).enableVersioning().build();
    expect(driver.getInfoURL({ id: "user.list" }, { page: 1, limit: 10 }).fullUrl)
      .toBe("https://api.example.com/v1/users?page=1&limit=10");
  });

  test("no version config gracefully ignores service versions", () => {
    const driver = new DriverBuilder()
      .withBaseURL("https://api.example.com").withServices(services).build();
    expect(driver.getInfoURL({ id: "user.list" }).fullUrl).toBe("https://api.example.com/users");
    expect(driver.getInfoURL({ id: "user.detail", params: { id: 123 } }).fullUrl)
      .toBe("https://api.example.com/users/123");
  });

  test("chaining withVersionConfig and withGlobalVersion", () => {
    const driver = new DriverBuilder()
      .withBaseURL("https://api.example.com").withServices(services)
      .withVersionConfig({ enabled: true, position: "after-base", prefix: "api-v" })
      .withGlobalVersion(3).build();
    expect(driver.getInfoURL({ id: "user.list" }).fullUrl).toBe("https://api.example.com/api-v3/users");
  });
});
