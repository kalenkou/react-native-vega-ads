import { DOMParser } from '@xmldom/xmldom';
import type { ClockPort, HttpPort } from '../ports';

export const DEFAULT_VAST_TIMEOUT_MS = 4000;

export type UrlHandlerResult =
  | { xml: Document; details: { byteLength: number; statusCode: number; rawXml: string } }
  | { error: Error; statusCode: number | null };

export interface UrlHandler {
  get(url: string, options: { timeout?: number }): Promise<UrlHandlerResult>;
}

export type LoadFailure =
  | { kind: 'timeout' }
  | { kind: 'http'; status: number }
  | { kind: 'xml' }
  | { kind: 'network' }
  | { kind: 'unknown' };

// vast-client re-throws our error as `new Error(error)`, so the only thing
// that survives is the message text. The failure kind is encoded in it.
const PREFIX = 'vega-ads:';

function failure(kind: string): Error {
  return new Error(`${PREFIX}${kind}`);
}

export function describeFailure(error: unknown): LoadFailure {
  const message = error instanceof Error ? error.message : String(error);
  const match = new RegExp(`${PREFIX}(timeout|xml|network|http:(\\d+))`).exec(message);
  if (!match) {
    return { kind: 'unknown' };
  }
  if (match[2]) {
    return { kind: 'http', status: Number(match[2]) };
  }
  return { kind: match[1] as 'timeout' | 'xml' | 'network' };
}

export function parseXml(text: string): Document | null {
  let fatal = false;
  const parser = new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: () => {
        fatal = true;
      },
      fatalError: () => {
        fatal = true;
      },
    },
  });
  const doc = parser.parseFromString(text, 'text/xml') as unknown as Document | undefined;
  if (fatal || !doc || !doc.documentElement) {
    return null;
  }
  return doc;
}

/**
 * URL handler for @dailymotion/vast-client on React Native (R16):
 * the built-in one uses the browser DOMParser, which React Native lacks.
 * The request is aborted after the timeout (R4).
 */
/** Turns XML text into a DOM document; returns null when the text is not well-formed XML. */
export type XmlParser = (text: string) => Document | null;

export interface UrlHandlerDeps {
  http: HttpPort;
  clock: ClockPort;
  timeoutMs?: number;
  /** Replaces the default @xmldom/xmldom parser, for example with a faster one. */
  parseXml?: XmlParser;
}

export function createUrlHandler(deps: UrlHandlerDeps): UrlHandler {
  const { http, clock } = deps;
  const parse = deps.parseXml ?? parseXml;
  const ownTimeout = deps.timeoutMs ?? DEFAULT_VAST_TIMEOUT_MS;

  return {
    async get(url, options) {
      const timeoutMs = Math.min(ownTimeout, options.timeout ?? ownTimeout);
      const controller = new AbortController();
      let timedOut = false;
      let expire: (error: Error) => void = () => undefined;
      // Rejects on the timer, so a port that ignores the signal still times out.
      const expired = new Promise<never>((_, reject) => (expire = reject));
      const timer = clock.setTimeout(() => {
        timedOut = true;
        controller.abort();
        expire(failure('timeout'));
      }, timeoutMs);

      try {
        const load = async () => {
          const response = await http.get(url, { signal: controller.signal });
          return { response, text: await response.text() };
        };
        const { response, text } = await Promise.race([load(), expired]);
        if (!response.ok) {
          return { error: failure(`http:${response.status}`), statusCode: response.status };
        }
        const xml = parse(text);
        if (!xml) {
          return { error: failure('xml'), statusCode: response.status };
        }
        return { xml, details: { byteLength: text.length, statusCode: response.status, rawXml: text } };
      } catch {
        if (timedOut) {
          return { error: failure('timeout'), statusCode: 408 };
        }
        return { error: failure('network'), statusCode: null };
      } finally {
        clock.clearTimeout(timer);
      }
    },
  };
}
