import { useEffect, useState } from 'react';
import {
  adIdMacros,
  AdPlan,
  adPlan,
  AdSchedule,
  ClockPort,
  HttpPort,
  installImagePolyfill,
  Macros,
  PreloadedAds,
  preloadAds,
} from 'react-native-ads-core';
import { fetchHttp, systemClock } from './platform';
import { vegaAdIdSource, VegaAdIdRetriever } from './vegaAdIdSource';

export interface PreloadVegaAdsOptions {
  /** Pass the same `adId` as to VegaAdsPlayer, so the early request carries the same ID. */
  adId?: VegaAdIdRetriever;
  /** Pass the same `macros` as to the player. */
  macros?: Macros;
  /** Pass the same break limits as to the player: the early request tells them to the ad server. */
  maxBreakAds?: number;
  maxBreakSeconds?: number;
  /** For tests and other runtimes. */
  http?: HttpPort;
  clock?: ClockPort;
}

/** Preloads waiting for their player, by schedule. A page preloads one title, so a few are enough. */
const waiting = new Map<string, { promise: Promise<PreloadedAds>; at: number }>();
const MAX_WAITING = 4;
/** A preload this recent is kept when the page asks again (a re-render, focus coming back). */
const REUSE_MS = 60_000;

/** The ad tag macros of a player: the Fire TV advertising ID, then the app's own. */
export function vegaMacros(adId?: VegaAdIdRetriever, macros?: Macros): Macros | undefined {
  return adId ? { ...adIdMacros(vegaAdIdSource(adId)), ...macros } : macros;
}

/**
 * Asks for a title's VMAP and pre-roll while the viewer is still on its page, so the pre-roll
 * starts sooner after Play. A VegaAdsPlayer (or useVegaAds) with the same `ads` schedule uses
 * the answers once, within five minutes; otherwise it asks the ad server itself.
 *
 * ```tsx
 * useEffect(() => preloadVegaAds({ vmapUrl }, { adId: AdIdRetriever }), [vmapUrl]);
 * ```
 */
export function preloadVegaAds(schedule: AdSchedule, options: PreloadVegaAdsOptions = {}): void {
  const clock = options.clock ?? systemClock;
  const key = JSON.stringify(schedule);
  const previous = waiting.get(key);
  if (previous && clock.now() - previous.at < REUSE_MS) {
    return;
  }
  const http = options.http ?? fetchHttp;
  installImagePolyfill(http);
  waiting.delete(key);
  waiting.set(key, {
    promise: preloadAds(schedule, {
      http,
      clock,
      macros: vegaMacros(options.adId, options.macros),
      maxBreakAds: options.maxBreakAds,
      maxBreakSeconds: options.maxBreakSeconds,
    }),
    at: clock.now(),
  });
  for (const oldest of waiting.keys()) {
    if (waiting.size <= MAX_WAITING) {
      break;
    }
    waiting.delete(oldest);
  }
}

/** The preload of this schedule key (`JSON.stringify(schedule)`), handed out once. */
export function takePreload(key: string): Promise<PreloadedAds> | undefined {
  const entry = waiting.get(key);
  waiting.delete(key);
  return entry?.promise;
}

/**
 * Preloads a title's ads (like preloadVegaAds) and returns what the viewer will see: the number of
 * breaks and the first one, for a line such as `adPlanLabel(plan)` next to Play. Null until the
 * schedule is known, or when it could not be loaded.
 *
 * ```tsx
 * const plan = useAdPlan({ vmapUrl }, { adId: AdIdRetriever });
 * <Text>{adPlanLabel(plan)}</Text>
 * ```
 */
export function useAdPlan(schedule: AdSchedule, options: PreloadVegaAdsOptions = {}): AdPlan | null {
  const key = JSON.stringify(schedule);
  const [plan, setPlan] = useState<{ key: string; plan: AdPlan | null } | null>(null);
  useEffect(() => {
    preloadVegaAds(schedule, options);
    let live = true;
    void waiting.get(key)?.promise.then((preloaded) => {
      if (live) {
        setPlan({ key, plan: adPlan(preloaded) });
      }
    });
    return () => {
      live = false;
    };
    // The schedule is compared by its key; the options are read once per schedule, as by the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [key]);
  return plan?.key === key ? plan.plan : null;
}
