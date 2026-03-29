"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWebSocketClient = createWebSocketClient;
function createWebSocketClient(config) {
    var _a, _b, _c;
    let ws = null;
    let reconnectAttempts = 0;
    let reconnectTimer = null;
    let intentionalClose = false;
    let pendingReconnect = false;
    const messageHandlers = new Set();
    const errorHandlers = new Set();
    const openHandlers = new Set();
    const closeHandlers = new Set();
    const maxAttempts = (_a = config.maxReconnectAttempts) !== null && _a !== void 0 ? _a : 5;
    const baseDelay = (_b = config.reconnectDelay) !== null && _b !== void 0 ? _b : 1000;
    const backoff = (_c = config.reconnectBackoff) !== null && _c !== void 0 ? _c : "exponential";
    function connect() {
        ws = new WebSocket(config.url, config.protocols);
        ws.onopen = () => {
            reconnectAttempts = 0;
            pendingReconnect = false;
            openHandlers.forEach((h) => h());
        };
        ws.onmessage = (event) => {
            let parsed;
            try {
                parsed = JSON.parse(event.data);
            }
            catch (_a) {
                parsed = event.data;
            }
            const msg = {
                data: parsed,
                timestamp: Date.now(),
                type: typeof parsed === "object" && parsed !== null && "type" in parsed
                    ? String(parsed.type) : "message",
            };
            messageHandlers.forEach((h) => h(msg));
        };
        ws.onerror = (event) => {
            errorHandlers.forEach((h) => h(event));
        };
        ws.onclose = () => {
            closeHandlers.forEach((h) => h());
            // Handle pending reconnect (from reconnect() method) — takes priority over auto-reconnect
            if (pendingReconnect) {
                pendingReconnect = false;
                connect();
                return;
            }
            if (!intentionalClose && config.autoReconnect && reconnectAttempts < maxAttempts) {
                const delay = backoff === "exponential"
                    ? baseDelay * Math.pow(2, reconnectAttempts) : baseDelay;
                reconnectAttempts++;
                reconnectTimer = setTimeout(() => connect(), delay);
            }
        };
    }
    connect();
    return {
        send(data) {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                throw new Error("WebSocket is not open. Current state: " + (ws ? ws.readyState : "null"));
            }
            ws.send(typeof data === "string" ? data : JSON.stringify(data));
        },
        close(code, reason) {
            intentionalClose = true;
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            ws === null || ws === void 0 ? void 0 : ws.close(code, reason);
        },
        onMessage(handler) {
            const h = handler;
            messageHandlers.add(h);
            return () => { messageHandlers.delete(h); };
        },
        onError(handler) {
            errorHandlers.add(handler);
            return () => { errorHandlers.delete(handler); };
        },
        onOpen(handler) {
            openHandlers.add(handler);
            return () => { openHandlers.delete(handler); };
        },
        onClose(handler) {
            closeHandlers.add(handler);
            return () => { closeHandlers.delete(handler); };
        },
        get state() {
            if (!ws)
                return "closed";
            switch (ws.readyState) {
                case WebSocket.CONNECTING: return "connecting";
                case WebSocket.OPEN: return "open";
                case WebSocket.CLOSING: return "closing";
                case WebSocket.CLOSED: return "closed";
                default: return "closed";
            }
        },
        reconnect() {
            intentionalClose = false;
            reconnectAttempts = 0;
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
                // Wait for close event before reconnecting
                pendingReconnect = true;
                ws.close();
            }
            else {
                connect();
            }
        },
    };
}
