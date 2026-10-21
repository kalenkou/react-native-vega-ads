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
  /** Its place in the ad pod: `<Ad sequence>`, or the place of a blocked ad that this spare ad took. Null for a stand-alone ad. */
  sequence: number | null;
  /** Seconds until Skip is allowed, or null when the ad is not skippable. */
  skipAfter: number | null;
}

/** Details of an event: the second argument of `onEvent`. */
export interface AdEventInfo {
  /** The break of the event: the same id as in the `break:<id>:...` events. */
  breakId?: string;
  /** The ad of the event, for ad events such as `impression`, quartiles, `skip` and `error:<code>`. */
  ad?: AdEventAd;
}

/** The names `onEvent` gets. What each one means: docs/api.md, "Events (`onEvent`)". */
export type AdEventName =
  | 'impression'
  | 'start'
  | 'firstQuartile'
  | 'midpoint'
  | 'thirdQuartile'
  | 'complete'
  | 'pause'
  | 'resume'
  | 'skip'
  | `loudness:${number}`
  | 'skipped:repeat'
  | 'skipped:advertiser'
  | 'skipped:category'
  | 'skipped:budget'
  | 'notUsed'
  | 'pauseAd:impression'
  | 'pauseAd:creativeView'
  | 'pauseAd:overlayViewDuration'
  | 'pauseAd:close'
  | `error:${number}`
  | 'error:start'
  | 'breakStart'
  | 'breakEnd'
  | 'content:ended'
  | `vmap:error:${number}`
  | `break:${string}:late`
  | `break:${string}:empty`
  | `break:${string}:interrupted`
  | `break:${string}:superseded`
  | 'standby:unavailable'
  | 'standby:error';

/**
 * `onEvent` callback: the event name and its details. `info` is `{}` for an event without a break or ad.
 * `name` is typed as `AdEventName` for autocompletion, and stays open to names a newer version adds.
 */
export type AdEventHandler = (name: AdEventName | (string & {}), info: AdEventInfo) => void;

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
