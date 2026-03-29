export interface WebSocketConfig {
  url: string;
  protocols?: string | string[];
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  reconnectBackoff?: "fixed" | "exponential";
}

export interface WebSocketMessage<T = unknown> {
  data: T;
  timestamp: number;
  type: string;
}

export type WebSocketEventHandler<T = unknown> = (message: WebSocketMessage<T>) => void;
export type WebSocketErrorHandler = (error: Event | Error) => void;
export type WebSocketStateHandler = () => void;
export type Unsubscribe = () => void;

export interface WebSocketClient {
  send: (data: unknown) => void;
  close: (code?: number, reason?: string) => void;
  onMessage: <T = unknown>(handler: WebSocketEventHandler<T>) => Unsubscribe;
  onError: (handler: WebSocketErrorHandler) => Unsubscribe;
  onOpen: (handler: WebSocketStateHandler) => Unsubscribe;
  onClose: (handler: WebSocketStateHandler) => Unsubscribe;
  readonly state: "connecting" | "open" | "closing" | "closed";
  reconnect: () => void;
}

export function createWebSocketClient(config: WebSocketConfig): WebSocketClient {
  let ws: WebSocket | null = null;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let intentionalClose = false;
  let pendingReconnect = false;

  const messageHandlers = new Set<WebSocketEventHandler>();
  const errorHandlers = new Set<WebSocketErrorHandler>();
  const openHandlers = new Set<WebSocketStateHandler>();
  const closeHandlers = new Set<WebSocketStateHandler>();

  const maxAttempts = config.maxReconnectAttempts ?? 5;
  const baseDelay = config.reconnectDelay ?? 1000;
  const backoff = config.reconnectBackoff ?? "exponential";

  function connect() {
    ws = new WebSocket(config.url, config.protocols);

    ws.onopen = () => {
      reconnectAttempts = 0;
      pendingReconnect = false;
      openHandlers.forEach((h) => h());
    };

    ws.onmessage = (event) => {
      let parsed: unknown;
      try { parsed = JSON.parse(event.data); }
      catch { parsed = event.data; }
      const msg: WebSocketMessage = {
        data: parsed,
        timestamp: Date.now(),
        type: typeof parsed === "object" && parsed !== null && "type" in parsed
          ? String((parsed as Record<string, unknown>).type) : "message",
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
    send(data: unknown) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket is not open. Current state: " + (ws ? ws.readyState : "null"));
      }
      ws.send(typeof data === "string" ? data : JSON.stringify(data));
    },

    close(code?: number, reason?: string) {
      intentionalClose = true;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      ws?.close(code, reason);
    },

    onMessage<T = unknown>(handler: WebSocketEventHandler<T>): Unsubscribe {
      const h = handler as WebSocketEventHandler;
      messageHandlers.add(h);
      return () => { messageHandlers.delete(h); };
    },

    onError(handler: WebSocketErrorHandler): Unsubscribe {
      errorHandlers.add(handler);
      return () => { errorHandlers.delete(handler); };
    },

    onOpen(handler: WebSocketStateHandler): Unsubscribe {
      openHandlers.add(handler);
      return () => { openHandlers.delete(handler); };
    },

    onClose(handler: WebSocketStateHandler): Unsubscribe {
      closeHandlers.add(handler);
      return () => { closeHandlers.delete(handler); };
    },

    get state(): "connecting" | "open" | "closing" | "closed" {
      if (!ws) return "closed";
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
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        // Wait for close event before reconnecting
        pendingReconnect = true;
        ws.close();
      } else {
        connect();
      }
    },
  };
}
