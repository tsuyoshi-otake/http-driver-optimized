import { DriverBuilder, MethodAPI } from "../../src/index";
import type { ServiceApi } from "../../src/types/driver";

describe("DriverBuilder", () => {
  test("throws error if configuration is incomplete", () => {
    expect(() => new DriverBuilder().build()).toThrow("Missing required configuration values");
    expect(() => new DriverBuilder().withBaseURL("http://example.com").build())
      .toThrow("Missing required configuration values");
  });

  test("builds driver with all expected methods", () => {
    const driver = new DriverBuilder()
      .withBaseURL("http://example.com")
      .withServices([{ id: "test", url: "api/test", method: MethodAPI.get }])
      .build();
    expect(typeof driver.execService).toBe("function");
    expect(typeof driver.execServiceByFetch).toBe("function");
    expect(typeof driver.getInfoURL).toBe("function");
    expect(typeof driver.get).toBe("function"); // AxiosInstance method
  });

  test("withCredentials defaults to true", () => {
    const driver = new DriverBuilder()
      .withBaseURL("http://example.com")
      .withServices([{ id: "test", url: "api/test", method: MethodAPI.get }])
      .build();
    expect((driver as any).defaults.withCredentials).toBe(true);
  });

  test("all builder methods chain correctly", () => {
    const services: ServiceApi[] = [{ id: "test", url: "api/test", method: MethodAPI.get }];

    const driver = new DriverBuilder()
      .withBaseURL("http://example.com")
      .withServices(services)
      .withVersionConfig({ enabled: true, position: "after-base" })
      .withGlobalVersion("2.0")
      .withAddAsyncRequestTransformAxios((register: any) => {
        (register as any)(async (req: any) => { req.headers = { ...req.headers, "X-Test": "1" }; });
      })
      .withAddAsyncResponseTransformAxios((register: any) => {
        (register as any)(async () => {});
      })
      .withAddRequestTransformAxios((req) => { req.headers = { ...req.headers, "X-Sync": "1" }; })
      .withAddResponseTransformAxios(() => {})
      .withHandleInterceptorErrorAxios((_ax, _pq, _ir, _atq) => async (error) => Promise.reject(error))
      .withAddTransformResponseFetch((response) => response)
      .withAddRequestTransformFetch((url, options) => ({ url, requestOptions: options }))
      .build();

    expect(driver).toBeDefined();
  });

  describe("version config builder methods", () => {
    test("withVersionTemplate creates versionConfig if not exists", () => {
      const builder = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([{ id: "test", url: "test", method: MethodAPI.get }])
        .withVersionTemplate("/api/v{version}/endpoint");

      const config = (builder as any).config;
      expect(config.versionConfig.template).toBe("/api/v{version}/endpoint");
      expect(config.versionConfig.position).toBe("custom");
      expect(config.versionConfig.enabled).toBe(true);
    });

    test("enableVersioning creates versionConfig if not exists", () => {
      const builder = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([{ id: "test", url: "test", method: MethodAPI.get }])
        .enableVersioning();

      expect((builder as any).config.versionConfig.enabled).toBe(true);
    });

    test("enableVersioning(false) disables versioning", () => {
      const builder = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([{ id: "test", url: "test", method: MethodAPI.get }])
        .enableVersioning(false);

      expect((builder as any).config.versionConfig.enabled).toBe(false);
    });

    test("withGlobalVersion creates versionConfig if not exists", () => {
      const builder = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([{ id: "test", url: "api/test", method: MethodAPI.get }])
        .withGlobalVersion("3.0");

      expect((builder as any).config.versionConfig.defaultVersion).toBe("3.0");
    });

    test("withVersionConfig sets enabled to true by default", () => {
      const builder = new DriverBuilder()
        .withBaseURL("http://example.com")
        .withServices([{ id: "test", url: "test", method: MethodAPI.get }])
        .withVersionConfig({ position: "after-base" });

      expect((builder as any).config.versionConfig.enabled).toBe(true);
    });
  });
});
