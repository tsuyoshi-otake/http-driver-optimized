import { buildRequestKey, serializePayloadKey } from "../../src/utils/request-key";

describe("request-key", () => {
  test("serializePayloadKey returns empty string for undefined payload", () => {
    expect(serializePayloadKey()).toBe("");
  });

  test("serializePayloadKey returns empty string for empty payload object", () => {
    expect(serializePayloadKey({})).toBe("");
  });

  test("serializePayloadKey returns JSON string for non-empty payload", () => {
    expect(serializePayloadKey({ page: 1, q: "term" })).toBe('{"page":1,"q":"term"}');
  });

  test("buildRequestKey composes method, url, and serialized payload", () => {
    expect(buildRequestKey("get", "/api/users")).toBe("get:/api/users:");
    expect(buildRequestKey("post", "/api/users", { page: 1 })).toBe('post:/api/users:{"page":1}');
  });
});
