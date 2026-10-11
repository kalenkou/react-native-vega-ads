import { VASTClient } from '@dailymotion/vast-client';
import type { ClockPort, HttpPort } from '../ports';
import type { AdSourceRef, VastAd, VastLinearCreative } from './types';
import { createUrlHandler, describeFailure, LoadFailure, parseXml, UrlHandler, XmlParser } from './urlHandler';

/**
 * vast-client counts documents, not wrappers: with `wrapperLimit: N` it follows
 * N - 1 wrappers. 6 lets a chain of 5 wrappers reach its InLine ad (R3).
 */
export const WRAPPER_LIMIT = 6;

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
}

const XML_PARSING_ERROR = 100;
const TRAFFICKING_ERROR = 200;

function cacheBust(url: string, random: () => number): string {
  return url.replace(/\[CACHEBUSTING\]/g, () => String(Math.floor(random() * 1e8)).padStart(8, '0'));
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

export async function requestVast(source: string | AdSourceRef, deps: VastRequestDeps): Promise<VastResult> {
  const ref: AdSourceRef = typeof source === 'string' ? { kind: 'url', url: source } : source;
  const network = createUrlHandler(deps);
  const urlHandler = ref.kind === 'xml' ? withEmbedded(ref.xml, network, deps.parseXml ?? parseXml) : network;
  const url = ref.kind === 'xml' ? EMBEDDED_URL : cacheBust(ref.url, deps.random ?? Math.random);
  const client = new VASTClient();
  const parser = client.getParser() as unknown as {
    on(event: 'VAST-error', listener: (data: { ERRORCODE?: number }) => void): void;
    trackVastError(urls: unknown[], macros: { ERRORCODE: number }): void;
  };
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
      wrapperLimit: WRAPPER_LIMIT,
      resolveAll: true,
    });
  } catch (error) {
    const failure = describeFailure(error);
    if (failure.kind === 'xml' || /Invalid VAST XMLDocument/.test(String(error))) {
      return { status: 'failed', errorCode: XML_PARSING_ERROR, failure: { kind: 'xml' } };
    }
    return { status: 'failed', errorCode: null, failure };
  }

  const ads: LinearAd[] = [];
  for (const ad of response.ads) {
    const creative = ad.creatives.find(isLinear);
    if (!creative) {
      parser.trackVastError(ad.errorURLTemplates, { ERRORCODE: TRAFFICKING_ERROR });
      errorCodes.push(TRAFFICKING_ERROR);
      continue;
    }
    ads.push({ ad, creative, sequence: toSequence(ad.sequence), skipAfter: toSkipAfter(creative.skipDelay), client });
  }

  if (ads.length === 0) {
    return { status: 'empty', errorCodes: [...new Set(errorCodes)] };
  }
  return { status: 'ok', ads, errorCodes: [...new Set(errorCodes)] };
}
