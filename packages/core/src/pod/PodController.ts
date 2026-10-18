import type { LinearAd } from '../vast';

export interface PodItem {
  ad: LinearAd;
  /** 1-based slot number, for "Ad 1 of 3". A buffet replacement keeps the slot number. */
  position: number;
  total: number;
}

export interface PodOptions {
  /** Do not start an ad that would end after this many ms from the break start (R10). */
  budgetMs?: number;
  /** Play at most this many ads; the rest of the slots go to `cut`. */
  maxAds?: number;
  /** Called with each pod ad that next() passes over because it does not fit the budget. */
  onSkipped?: (ad: LinearAd) => void;
}

interface Slot {
  ad: LinearAd;
  source: number;
}

/**
 * Orders the ads of one break (R17).
 * - Optimized pod: ads with `sequence` play in that order; ads without it are buffet.
 * - Response without sequence numbers: only the first ad plays; the rest is buffet.
 * - Standard pod: several responses for one break are joined in source order.
 * - Buffet ads replace a failed ad from the same response, at the same position.
 */
export class PodController {
  readonly total: number;
  /** Ads left out because the break allows only `maxAds`. */
  readonly cut: LinearAd[];
  private readonly slots: Slot[];
  private readonly buffets: LinearAd[][];
  private readonly budgetMs: number | undefined;
  private onSkipped: (ad: LinearAd) => void;
  private index = -1;
  private current: Slot | null = null;
  private replaceCurrent = false;

  constructor(responses: LinearAd[][], options: PodOptions = {}) {
    this.budgetMs = options.budgetMs;
    this.onSkipped = options.onSkipped ?? (() => undefined);
    const slots: Slot[] = [];
    this.buffets = responses.map((ads, source) => {
      const pod = ads
        .filter((a) => a.sequence !== null)
        .sort((a, b) => (a.sequence as number) - (b.sequence as number));
      const standalone = ads.filter((a) => a.sequence === null);
      if (pod.length > 0) {
        pod.forEach((a) => slots.push({ ad: a, source }));
        return standalone;
      }
      const [first, ...rest] = standalone;
      if (first) {
        slots.push({ ad: first, source });
      }
      return rest;
    });
    const keep = options.maxAds === undefined ? slots.length : options.maxAds;
    this.slots = slots.slice(0, keep);
    this.cut = slots.slice(keep).map((slot) => slot.ad);
    this.total = this.slots.length;
  }

  /** The ad to play next, or null when the break is over. */
  next(elapsedMs = 0): PodItem | null {
    if (this.replaceCurrent && this.current) {
      this.replaceCurrent = false;
      const spare = this.takeSpare(this.current.source, elapsedMs);
      if (spare) {
        return { ad: spare, position: this.index + 1, total: this.total };
      }
    }
    this.replaceCurrent = false;

    while (++this.index < this.slots.length) {
      const slot = this.slots[this.index] as Slot;
      if (this.fits(slot.ad, elapsedMs)) {
        this.current = slot;
        return { ad: slot.ad, position: this.index + 1, total: this.total };
      }
      this.onSkipped(slot.ad);
    }
    this.current = null;
    return null;
  }

  /** What next() would return now, without moving on. Used to prebuffer the next ad. */
  peek(elapsedMs = 0): PodItem | null {
    const copy = Object.create(PodController.prototype) as PodController;
    Object.assign(copy, this, { buffets: this.buffets.map((buffet) => [...buffet]), onSkipped: () => undefined });
    return copy.next(elapsedMs);
  }

  /** The ad returned by the last next() could not play; next() will try a buffet replacement. */
  fail(): void {
    if (this.current) {
      this.replaceCurrent = true;
    }
  }

  private takeSpare(source: number, elapsedMs: number): LinearAd | undefined {
    const buffet = this.buffets[source] ?? [];
    const at = buffet.findIndex((a) => this.fits(a, elapsedMs));
    return at >= 0 ? buffet.splice(at, 1)[0] : undefined;
  }

  private fits(ad: LinearAd, elapsedMs: number): boolean {
    const duration = ad.creative.duration;
    if (this.budgetMs === undefined || !(duration > 0)) {
      return true;
    }
    return elapsedMs + duration * 1000 <= this.budgetMs;
  }
}
