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
export declare function createWebSocketClient(config: WebSocketConfig): WebSocketClient;
