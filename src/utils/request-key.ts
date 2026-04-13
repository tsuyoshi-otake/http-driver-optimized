export function serializePayloadKey(payload?: Record<string, unknown>): string {
  if (!payload) return "";

  const serializedPayload = JSON.stringify(payload);
  return serializedPayload === "{}" ? "" : serializedPayload;
}

export function buildRequestKey(
  method: string,
  url: string,
  payload?: Record<string, unknown>
): string {
  return `${method}:${url}:${serializePayloadKey(payload)}`;
}
