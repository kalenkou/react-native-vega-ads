/**
 * Ports for networking and time. The VAST layer never calls fetch or timers directly.
 */

export interface ClockPort {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  text(): Promise<string>;
}

export interface HttpRequestOptions {
  signal?: AbortSignal;
}

export interface HttpPort {
  get(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
}

export interface LoggerPort {
  debug(message: string): void;
  warn(message: string): void;
}

export const silentLogger: LoggerPort = {
  debug: () => undefined,
  warn: () => undefined,
};
