import {
  createGraphQLClient,
  parseNDJSONStream,
  fetchWithDownloadProgress,
  createUploadProgressBody,
  createWebSocketClient,
  MethodAPI,
  DriverBuilder,
} from "../../src/index";

describe("Package exports", () => {
  test("exports createGraphQLClient", () => {
    expect(typeof createGraphQLClient).toBe("function");
  });

  test("exports parseNDJSONStream", () => {
    expect(typeof parseNDJSONStream).toBe("function");
  });

  test("exports fetchWithDownloadProgress", () => {
    expect(typeof fetchWithDownloadProgress).toBe("function");
  });

  test("exports createUploadProgressBody", () => {
    expect(typeof createUploadProgressBody).toBe("function");
  });

  test("exports createWebSocketClient", () => {
    expect(typeof createWebSocketClient).toBe("function");
  });

  test("exports MethodAPI enum", () => {
    expect(MethodAPI.get).toBe("get");
    expect(MethodAPI.post).toBe("post");
  });

  test("exports DriverBuilder class", () => {
    expect(typeof DriverBuilder).toBe("function");
  });
});
