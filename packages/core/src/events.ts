import type { LinearAd } from './vast/request/VastRequester';

/** The ad an event is about, from its VAST. */
export interface AdEventAd {
  /** `<Ad id>`. */
  id?: string;
  /** `<Creative id>`. */
  creativeId?: string;
  /** The first `<UniversalAdId>` (VAST 4): the creative's id in a shared registry. */
  universalAdId?: string;
  /** `<AdTitle>`. */
  title?: string;
  /** `<Advertiser>` (VAST 4). */
  advertiser?: string;
  /** Seconds, from `<Duration>`; 0 when the VAST has none. */
  duration: number;
  /** Position in an ad pod (`<Ad sequence>`), or null for a stand-alone ad. */
  sequence: number | null;
  /** Seconds until Skip is allowed, or null when the ad is not skippable. */
  skipAfter: number | null;
}

/** Details of an event: the second argument of `onEvent`. */
export interface AdEventInfo {
  /** The break of the event: the same id as in the `break:<id>:…` events. */
  breakId?: string;
  /** The ad of the event, for ad events such as `impression`, quartiles, `skip` and `error:<code>`. */
  ad?: AdEventAd;
}

/** `onEvent` callback: the event name and its details. `info` is `{}` for an event without a break or ad. */
export type AdEventHandler = (name: string, info: AdEventInfo) => void;

/** @internal The details of a VAST ad for `onEvent`. */
export function adEventAd(linear: LinearAd): AdEventAd {
  const { ad, creative } = linear;
  return {
    id: ad.id ?? undefined,
    creativeId: creative.id ?? undefined,
    universalAdId: creative.universalAdIds?.[0]?.value || undefined,
    title: ad.title ?? undefined,
    advertiser: ad.advertiser?.value?.trim() || undefined,
    duration: creative.duration > 0 ? creative.duration : 0,
    sequence: linear.sequence,
    skipAfter: linear.skipAfter,
  };
}
