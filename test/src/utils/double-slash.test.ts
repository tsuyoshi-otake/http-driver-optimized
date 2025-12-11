import { DriverConfig, MethodAPI } from "../../../src/types/driver";
import { buildUrlWithVersion, compileUrlByService } from "../../../src/utils/index";

describe("Double Slash Prevention", () => {
    describe("buildUrlWithVersion", () => {
        test("prevents double slashes when joining baseURL and endpoint", () => {
            const baseURL = "https://api.example.com/";
            const endpoint = "/users";
            // @ts-ignore
            const result = buildUrlWithVersion(baseURL, endpoint, undefined, { enabled: false });
            expect(result).toBe("https://api.example.com/users");
        });

        test("prevents double slashes with version injection (after-base)", () => {
            const baseURL = "https://api.example.com/";
            const endpoint = "/users";
            const version = "1";
            const config = { enabled: true, position: 'after-base' as const };
            // @ts-ignore
            const result = buildUrlWithVersion(baseURL, endpoint, version, config);
            expect(result).toBe("https://api.example.com/v1/users");
        });

        test("prevents double slashes with version injection (before-endpoint)", () => {
            const baseURL = "https://api.example.com/";
            const endpoint = "/users";
            const version = "1";
            const config = { enabled: true, position: 'before-endpoint' as const };
            // @ts-ignore
            const result = buildUrlWithVersion(baseURL, endpoint, version, config);
            expect(result).toBe("https://api.example.com/users/v1");
        });
    });

    describe("compileUrlByService", () => {
        test("prevents double slashes in final URL with specific example", () => {
            const config: DriverConfig = {
                baseURL: "https://smile-chat-develop.systemexe-research-and-development.workers.dev/",
                services: [
                    {
                        id: "login",
                        url: "/api/v1/auth/login",
                        method: MethodAPI.post
                    }
                ]
            };
            
            const result = compileUrlByService(config, { id: "login" });
            expect(result?.url).toBe("https://smile-chat-develop.systemexe-research-and-development.workers.dev/api/v1/auth/login");
        });

        test("prevents double slashes when baseURL has no trailing slash but endpoint has leading slash", () => {
            const config: DriverConfig = {
                baseURL: "https://api.example.com",
                services: [
                    {
                        id: "test",
                        url: "/endpoint",
                        method: MethodAPI.get
                    }
                ]
            };
            
            const result = compileUrlByService(config, { id: "test" });
            expect(result?.url).toBe("https://api.example.com/endpoint");
        });
        
        test("prevents double slashes when baseURL has trailing slash and endpoint has NO leading slash", () => {
            const config: DriverConfig = {
                baseURL: "https://api.example.com/",
                services: [
                    {
                        id: "test",
                        url: "endpoint",
                        method: MethodAPI.get
                    }
                ]
            };
            
            const result = compileUrlByService(config, { id: "test" });
            expect(result?.url).toBe("https://api.example.com/endpoint");
        });
    });
});
