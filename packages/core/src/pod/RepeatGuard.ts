import type { ClockPort, LinearAd } from '../vast';

/** Default time in which a creative the viewer has seen is not shown again: 30 minutes. */
export const REPEAT_WINDOW_MS = 30 * 60 * 1000;

export interface RepeatOptions {
  /** A creative shown less than this many ms ago is not shown again. Default REPEAT_WINDOW_MS. */
  withinMs?: number;
}

export interface DroppedAd {
  ad: LinearAd;
  /** `repeat`: the same creative was shown or comes earlier in the break; `advertiser`: so does its advertiser. */
  reason: 'repeat' | 'advertiser';
}

/**
 * The names of one creative. One creative often reaches the player through several ad
 * sources under different ad ids, so the ad server cannot see the repeat; the player sees
 * what it plays. Universal Ad ID ("unknown" means none) and media file URLs are compared.
 */
function creativeKeys(linear: LinearAd): string[] {
  const keys = (linear.creative.universalAdIds ?? [])
    .filter((id) => id.value && id.value !== 'unknown')
    .map((id) => `uaid:${id.idRegistry}:${id.value}`);
  linear.creative.mediaFiles.forEach((file) => file.fileURL && keys.push(`media:${file.fileURL}`));
  return keys;
}

function advertiserKey(linear: LinearAd): string | null {
  const advertiser = linear.ad.advertiser;
  if (advertiser?.id) {
    return `id:${advertiser.id}`;
  }
  const name = advertiser?.value?.trim().toLowerCase();
  return name ? `name:${name}` : null;
}

/** The ads of one response in the order they would play: the pod by sequence, then the rest. */
function playOrder(ads: LinearAd[]): LinearAd[] {
  const pod = ads.filter((a) => a.sequence !== null).sort((a, b) => (a.sequence as number) - (b.sequence as number));
  return [...pod, ...ads.filter((a) => a.sequence === null)];
}

/**
 * Viewer rules for the ads of one piece of content:
 * - a creative is not shown again within `withinMs` of its impression;
 * - a break has one copy of each creative and one ad per advertiser.
 * Kept in memory only; no viewer id is needed.
 */
export class RepeatGuard {
  private readonly seen = new Map<string, number>();
  private readonly withinMs: number;

  constructor(
    private readonly clock: ClockPort,
    options: RepeatOptions = {},
  ) {
    this.withinMs = options.withinMs ?? REPEAT_WINDOW_MS;
  }

  /** The creative's first frame was on screen. */
  shown(linear: LinearAd): void {
    const now = this.clock.now();
    creativeKeys(linear).forEach((key) => this.seen.set(key, now));
  }

  /** Removes from the responses of one break the ads the rules do not allow. */
  filter(responses: LinearAd[][]): { responses: LinearAd[][]; dropped: DroppedAd[] } {
    const now = this.clock.now();
    const inBreak = new Set<string>();
    const advertisers = new Set<string>();
    const dropped: DroppedAd[] = [];
    const kept = responses.map((ads) => {
      const allowed = new Set<LinearAd>();
      for (const linear of playOrder(ads)) {
        const keys = creativeKeys(linear);
        const advertiser = advertiserKey(linear);
        const seenAt = keys.map((key) => this.seen.get(key)).filter((at): at is number => at !== undefined);
        if (keys.some((key) => inBreak.has(key)) || seenAt.some((at) => now - at < this.withinMs)) {
          dropped.push({ ad: linear, reason: 'repeat' });
        } else if (advertiser && advertisers.has(advertiser)) {
          dropped.push({ ad: linear, reason: 'advertiser' });
        } else {
          allowed.add(linear);
          keys.forEach((key) => inBreak.add(key));
          if (advertiser) {
            advertisers.add(advertiser);
          }
        }
      }
      return ads.filter((a) => allowed.has(a));
    });
    return { responses: kept, dropped };
  }
}
