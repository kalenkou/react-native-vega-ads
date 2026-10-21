import { VASTClient } from '@dailymotion/vast-client';
import type { ClockPort, HttpPort } from '../ports';
import type { Macros } from '../tracking/AdTracker';
import type { AdSourceRef, VastAd, VastLinearCreative } from './types';
import { createUrlHandler, describeFailure, LoadFailure, parseXml, UrlHandler, XmlParser } from './urlHandler';

/** Wrappers followed by default before VAST error 302 (R3). `maxRedirects` changes it. */
export const MAX_REDIRECTS = 5;

/**
 * vast-client counts documents, not wrappers: with `wrapperLimit: N` it follows
 * N - 1 wrappers. 6 lets a chain of 5 wrappers reach its InLine ad (R3).
 * @deprecated Use `MAX_REDIRECTS`.
 */
export const WRAPPER_LIMIT = MAX_REDIRECTS + 1;

/** A whole number of wrappers from 0 up; anything else keeps the default. */
function redirectsOf(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? Math.floor(value) : MAX_REDIRECTS;
}

export interface LinearAd {
  ad: VastAd;
  creative: VastLinearCreative;
  /** Position in an optimized pod, or null for a stand-alone ("buffet") ad. */
  sequence: number | null;
  /** Seconds after which Skip is allowed, or null when the ad is not skippable (R8). */
  skipAfter: number | null;
  /** The client that loaded the ad; VASTTracker needs it. */
  client: VASTClient;
}

export type VastResult =
  | { status: 'ok'; ads: LinearAd[]; errorCodes: number[] }
  | { status: 'empty'; errorCodes: number[] }
  /** The first request failed; there is no document, so no Error URL to call. */
  | { status: 'failed'; errorCode: number | null; failure: LoadFailure };

export interface VastRequestDeps {
  http: HttpPort;
  clock: ClockPort;
  timeoutMs?: number;
  random?: () => number;
  parseXml?: XmlParser;
  /** App macros for the ad tag and every wrapper URL, for example from adIdMacros() (R15). */
  macros?: Macros;
  /** How many wrappers to follow before giving up with VAST error 302. Default 5 (R3). */
  maxRedirects?: number;
}

const XML_PARSING_ERROR = 100;
export const TRAFFICKING_ERROR = 200;

/**
 * Fills the macros of an ad request URL: the app's own, [TIMESTAMP] and [CACHEBUSTING].
 * Values are URL-encoded; unknown macros stay as they are.
 */
export function fillMacros(url: string, deps: Pick<VastRequestDeps, 'clock' | 'macros' | 'random'>): string {
  const values: Macros = {
    TIMESTAMP: new Date(deps.clock.now()).toISOString(),
    ...deps.macros,
    CACHEBUSTING: String(Math.floor((deps.random ?? Math.random)() * 1e8)).padStart(8, '0'),
  };
  return url.replace(/\[([A-Z_]+)\]/g, (macro, name: string) =>
    values[name] === undefined ? macro : encodeURIComponent(values[name] as string),
  );
}

/**
 * The macros of a break's ad requests: the given ones plus `[BLOCKEDADCATEGORIES]` (VAST 4.1).
 * It lists the app's own blocked categories (`macros.BLOCKEDADCATEGORIES`) and the break's,
 * comma separated, once each and in the taxonomy they were given in. Empty when nothing is
 * blocked. So the ad server can choose fitting ads up front.
 */
export function withBlockedCategories(macros: Macros | undefined, blocked: readonly string[] | undefined): Macros {
  const own = (macros?.BLOCKEDADCATEGORIES ?? '').split(',').map((code) => code.trim());
  const all = [...new Set([...own, ...(blocked ?? [])])].filter(Boolean);
  return { ...macros, BLOCKEDADCATEGORIES: all.join(',') };
}

/** Every request, the ad tag and each wrapper's VASTAdTagURI, gets its macros filled (VAST 4.x). */
function withMacros(handler: UrlHandler, deps: VastRequestDeps): UrlHandler {
  return { get: (url, options) => handler.get(fillMacros(url, deps), options) };
}

function toSequence(value: VastAd['sequence']): number | null {
  const parsed = value === null || value === undefined ? NaN : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// vast-client uses null for "no skipoffset" and -1 for a skipoffset it could not parse.
function toSkipAfter(skipDelay: number | null): number | null {
  return typeof skipDelay === 'number' && skipDelay >= 0 ? skipDelay : null;
}

function isLinear(creative: { type: string }): creative is VastLinearCreative {
  return creative.type === 'linear';
}

const EMBEDDED_URL = 'vega-ads:embedded-vast';

/** Serves VAST that came inside a VMAP; any wrapper it points to goes to the network. */
function withEmbedded(xml: string, network: UrlHandler, parse: XmlParser): UrlHandler {
  return {
    async get(url, options) {
      if (url !== EMBEDDED_URL) {
        return network.get(url, options);
      }
      const doc = parse(xml);
      return doc
        ? { xml: doc, details: { byteLength: xml.length, statusCode: 200, rawXml: xml } }
        : { error: new Error('vega-ads:xml'), statusCode: null };
    },
  };
}

export interface LoadedVast {
  client: VASTClient;
  ads: VastAd[];
  errorCodes: number[];
  /** Sends the Error URLs of an ad with this code and the app macros. */
  trackError(ad: VastAd, code: number): void;
}

/**
 * Requests and parses a VAST document with the app macros, following wrappers. Shared by the
 * break ads (linear) and the pause ad (NonLinear).
 */
export async function loadVast(
  source: string | AdSourceRef,
  deps: VastRequestDeps,
): Promise<LoadedVast | Extract<VastResult, { status: 'failed' }>> {
  const ref: AdSourceRef = typeof source === 'string' ? { kind: 'url', url: source } : source;
  const network = withMacros(createUrlHandler(deps), deps);
  const urlHandler = ref.kind === 'xml' ? withEmbedded(ref.xml, network, deps.parseXml ?? parseXml) : network;
  const url = ref.kind === 'xml' ? EMBEDDED_URL : ref.url;
  const client = new VASTClient();
  const parser = client.getParser() as unknown as {
    on(event: 'VAST-error', listener: (data: { ERRORCODE?: number }) => void): void;
    trackVastError(urls: unknown[], macros: { ERRORCODE: number }, ...data: unknown[]): void;
  };
  // vast-client sends its own error pixels (301, 302, 303...) with ERRORCODE only: add the app macros.
  const trackVastError = parser.trackVastError.bind(parser);
  parser.trackVastError = (urls, macros, ...data) => trackVastError(urls, { ...deps.macros, ...macros }, ...data);
  const errorCodes: number[] = [];
  parser.on('VAST-error', (data) => {
    if (typeof data.ERRORCODE === 'number') {
      errorCodes.push(data.ERRORCODE);
    }
  });

  let response: { ads: VastAd[] };
  try {
    response = await client.get(url, {
      urlHandler,
      timeout: deps.timeoutMs,
      wrapperLimit: redirectsOf(deps.maxRedirects) + 1,
      resolveAll: true,
    });
  } catch (error) {
    const failure = describeFailure(error);
    if (failure.kind === 'xml' || /Invalid VAST XMLDocument/.test(String(error))) {
      return { status: 'failed', errorCode: XML_PARSING_ERROR, failure: { kind: 'xml' } };
    }
    return { status: 'failed', errorCode: null, failure };
  }
  return {
    client,
    ads: response.ads,
    errorCodes,
    trackError(ad, code) {
      parser.trackVastError(ad.errorURLTemplates, { ERRORCODE: code });
      errorCodes.push(code);
    },
  };
}

export async function requestVast(source: string | AdSourceRef, deps: VastRequestDeps): Promise<VastResult> {
  const loaded = await loadVast(source, deps);
  if ('status' in loaded) {
    return loaded;
  }
  const { client, errorCodes } = loaded;
  const ads: LinearAd[] = [];
  for (const ad of loaded.ads) {
    const creative = ad.creatives.find(isLinear);
    if (!creative) {
      loaded.trackError(ad, TRAFFICKING_ERROR);
      continue;
    }
    ads.push({ ad, creative, sequence: toSequence(ad.sequence), skipAfter: toSkipAfter(creative.skipDelay), client });
  }

  if (ads.length === 0) {
    return { status: 'empty', errorCodes: [...new Set(errorCodes)] };
  }
  return { status: 'ok', ads, errorCodes: [...new Set(errorCodes)] };
}
