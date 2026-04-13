"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializePayloadKey = serializePayloadKey;
exports.buildRequestKey = buildRequestKey;
function serializePayloadKey(payload) {
    if (!payload)
        return "";
    const serializedPayload = JSON.stringify(payload);
    return serializedPayload === "{}" ? "" : serializedPayload;
}
function buildRequestKey(method, url, payload) {
    return `${method}:${url}:${serializePayloadKey(payload)}`;
}
