import { DOMParser } from '@xmldom/xmldom';
import { log } from './log';

const DEFAULT_TIMEOUT_MS = 4000;

type HandlerResult =
  | { xml: Document; details: { byteLength: number; statusCode: number; rawXml: string } }
  | { error: Error; statusCode: number | null };

/**
 * URL handler for @dailymotion/vast-client in React Native:
 * fetch + AbortController timeout + xmldom instead of the browser DOMParser.
 */
export const urlHandler = {
  async get(url: string, options: { timeout?: number } = {}): Promise<HandlerResult> {
    const controller = new AbortController();
    const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const response = await fetch(url, { signal: controller.signal });
      const text = await response.text();
      log(`vast: HTTP ${response.status}, ${text.length} bytes, ${Date.now() - started} ms`);
      if (!response.ok) {
        return { error: new Error(`HTTP ${response.status}`), statusCode: response.status };
      }
      const xml = new DOMParser().parseFromString(text, 'text/xml') as unknown as Document;
      return { xml, details: { byteLength: text.length, statusCode: response.status, rawXml: text } };
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      log(`vast: ${isTimeout ? 'timeout' : 'network error'} after ${Date.now() - started} ms`);
      return { error: error as Error, statusCode: isTimeout ? 408 : null };
    } finally {
      clearTimeout(timer);
    }
  },
};
