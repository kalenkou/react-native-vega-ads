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

/** An `<Extension>` or `<CreativeExtension>` and its children, as vast-client parses them. */
export interface VastExtension {
  name: string | null;
  value: string | null;
  attributes: Record<string, string>;
  children: VastExtension[];
}

export interface VastLinearCreative {
  type: 'linear';
  id: string | null;
  duration: number;
  /** As parsed by vast-client: null without skipoffset, -1 when it could not be parsed. Use LinearAd.skipAfter. */
  skipDelay: number | null;
  mediaFiles: VastMediaFile[];
  trackingEvents: Record<string, string[]>;
  /** <UniversalAdId>: the creative's id in a registry that all ad servers share (VAST 4). */
  universalAdIds?: Array<{ idRegistry: string; value: string }>;
  creativeExtensions?: VastExtension[];
}

export interface VastAd {
  id: string | null;
  sequence: string | number | null;
  title: string | null;
  errorURLTemplates: unknown[];
  impressionURLTemplates: unknown[];
  creatives: Array<{ type: string }>;
  /** <Advertiser>, for keeping competitors apart (VAST 4). */
  advertiser?: { id: string | null; value: string } | null;
  /** <Category>: what the ad sells, as IAB Ad Product Taxonomy codes (VAST 4.1). */
  categories?: Array<{ authority: string | null; value: string }>;
}

/** Where the VAST for one ad request comes from: a URL, or XML embedded in a VMAP. */
export type AdSourceRef = { kind: 'url'; url: string } | { kind: 'xml'; xml: string };
