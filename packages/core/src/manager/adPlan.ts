import { PodController } from '../pod/PodController';
import { AdUiStrings, defaultAdUiStrings } from '../ui/adUiState';
import type { PreloadedAds } from './preloadAds';

/** What a viewer can know about a title's ads before Play. */
export interface AdPlan {
  /** Ad breaks in the schedule: pre-roll, mid-rolls and post-roll. */
  breaks: number;
  /**
   * The ads that would play right after Play, from the preloaded pre-roll answer; null without
   * one. Later breaks are asked for during playback, so their ads are not known yet.
   */
  preroll: { ads: number; seconds: number; skipAfter: number | null } | null;
}

/** The plan of a preload; null when the schedule could not be loaded. */
export function adPlan(preloaded: PreloadedAds): AdPlan | null {
  if (!preloaded.breaks) {
    return null;
  }
  const responses = (preloaded.preroll?.results ?? []).map((result) => (result.status === 'ok' ? result.ads : []));
  // The same choice the break makes: the pod in order, one buffet ad per source without a pod.
  const pod = new PodController(responses);
  const ads = [];
  for (let item = pod.next(); item; item = pod.next()) {
    ads.push(item.ad);
  }
  const first = ads[0];
  return {
    breaks: preloaded.breaks.length,
    preroll: first
      ? {
          ads: ads.length,
          seconds: Math.round(ads.reduce((sum, ad) => sum + ad.creative.duration, 0)),
          skipAfter: first.skipAfter,
        }
      : null,
  };
}

/** "4 ad breaks · first: 2 ads, 25 s, skippable after 5 s"; empty while the plan is unknown. */
export function adPlanLabel(plan: AdPlan | null, strings: Partial<AdUiStrings> = {}): string {
  return plan ? { ...defaultAdUiStrings, ...strings }.adPlan(plan) : '';
}
