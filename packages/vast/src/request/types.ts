/**
 * The parts of @dailymotion/vast-client objects that vega-ads reads.
 * The library ships `any` types, so these narrow interfaces document
 * what we rely on; tests on real fixtures keep them honest.
 */

export interface VastMediaFile {
  fileURL: string | null;
  mimeType: string | null;
  codec: string | null;
  deliveryType: string;
  width: number;
  height: number;
  bitrate: number;
  minBitrate: number;
  maxBitrate: number;
  apiFramework: string | null;
}

export interface VastLinearCreative {
  type: 'linear';
  id: string | null;
  duration: number;
  /** As parsed by vast-client: null without skipoffset, -1 when it could not be parsed. Use LinearAd.skipAfter. */
  skipDelay: number | null;
  mediaFiles: VastMediaFile[];
  trackingEvents: Record<string, string[]>;
}

export interface VastAd {
  id: string | null;
  sequence: string | number | null;
  title: string | null;
  errorURLTemplates: unknown[];
  impressionURLTemplates: unknown[];
  creatives: Array<{ type: string }>;
}

/** Where the VAST for one ad request comes from: a URL, or XML embedded in a VMAP. */
export type AdSourceRef = { kind: 'url'; url: string } | { kind: 'xml'; xml: string };
