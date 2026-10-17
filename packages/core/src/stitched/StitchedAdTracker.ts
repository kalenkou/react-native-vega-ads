import { requestVast, type LinearAd, type VastRequestDeps } from '../vast/request/VastRequester';
import { requestVmap, type BreakOffset } from '../vast/request/VmapRequester';
import { AdTracker, type AdTrackerOptions, type Macros } from '../vast/tracking/AdTracker';

/** One ad already inside the content stream (server-side ad insertion), on the content timeline. */
export interface StitchedAd {
  readonly ad: LinearAd;
  /** Content seconds where the ad starts and ends. */
  readonly start: number;
  readonly end: number;
  /** Position in its break, from 1, and the number of ads in the break: "Ad 1 of 2". */
  readonly index: number;
  readonly count: number;
}

/** The ads of one break, one after another from the break time, by their VAST <Duration>. */
export function stitchedBreak(breakStart: number, ads: readonly LinearAd[]): StitchedAd[] {
  let start = breakStart;
  return ads.map((ad, i) => {
    const end = start + ad.creative.duration;
    const placed = { ad, start, end, index: i + 1, count: ads.length };
    start = end;
    return placed;
  });
}

/**
 * The ads of a VMAP for a stream that already contains them (server-side ad insertion).
 * The break times are positions in that stream, ads included. `start` is 0, `n%` is a share of
 * `streamSeconds`, and `end` puts the break's ads at the very end of the stream; without a
 * known length (NaN or 0) those two kinds are left out. A break whose VAST fails has no ads.
 */
export async function loadStitchedAds(
  vmapUrl: string,
  deps: VastRequestDeps & { macros?: Macros },
  streamSeconds: number,
): Promise<StitchedAd[]> {
  const vmap = await requestVmap(vmapUrl, deps);
  if (vmap.status !== 'ok') {
    return [];
  }
  const known = Number.isFinite(streamSeconds) && streamSeconds > 0;
  const placed: StitchedAd[] = [];
  for (const adBreak of vmap.breaks) {
    const ads: LinearAd[] = [];
    for (const { source } of adBreak.sources) {
      const result = await requestVast(source, deps);
      if (result.status === 'ok') ads.push(...result.ads);
    }
    const length = ads.reduce((sum, ad) => sum + ad.creative.duration, 0);
    const at = breakSeconds(adBreak.offset, known ? streamSeconds : null, length);
    if (at !== null) placed.push(...stitchedBreak(at, ads));
  }
  return placed;
}

function breakSeconds(offset: BreakOffset, stream: number | null, adSeconds: number): number | null {
  switch (offset.kind) {
    case 'start':
      return 0;
    case 'time':
      return offset.seconds;
    case 'percent':
      return stream === null ? null : (stream * offset.percent) / 100;
    case 'end':
      return stream === null ? null : stream - adSeconds;
  }
}

export interface StitchedAdState {
  index: number;
  count: number;
  /** Whole seconds left in this ad, for the label. */
  remaining: number;
  /** null: the ad cannot be skipped. */
  secondsUntilSkip: number | null;
}

export interface StitchedOptions extends AdTrackerOptions {
  /** A time step larger than this (seconds) is a seek, not playback. Default 2. */
  seekThreshold?: number;
}

type Status = 'waiting' | 'playing' | 'done';

/**
 * IAB tracking for ads stitched into the stream by the server: no player switch, the content
 * time alone says which ad plays. Feed it every content time update.
 *
 * Rules: an ad counts only when playback enters it at its start (a seek to the break start
 * counts; a seek into the middle of an ad does not, so no quartile is reported unseen). A seek
 * out of an ad ends its tracking without complete. Each ad is tracked once.
 */
export class StitchedAdTracker {
  private readonly items: Array<{ placed: StitchedAd; tracker: AdTracker; status: Status }>;
  private readonly seekThreshold: number;
  private last: number | null = null;

  constructor(ads: readonly StitchedAd[], options: StitchedOptions = {}) {
    this.seekThreshold = options.seekThreshold ?? 2;
    this.items = ads.map((placed) => ({ placed, tracker: new AdTracker(placed.ad, options), status: 'waiting' }));
  }

  private active() {
    return this.items.find((item) => item.status === 'playing') ?? null;
  }

  update(time: number): void {
    const jumped = this.last !== null && Math.abs(time - this.last) > this.seekThreshold;
    this.last = time;
    const active = this.active();
    if (active) {
      const { placed, tracker } = active;
      if (jumped) {
        active.status = 'done';
      } else if (time >= placed.end) {
        tracker.ended();
        active.status = 'done';
      } else {
        tracker.progress(Math.max(0, time - placed.start));
        return;
      }
    }
    const entered = this.items.find((item) => item.placed.start <= time && time < item.placed.end);
    if (!entered || entered.status !== 'waiting') {
      return;
    }
    if (time - entered.placed.start > this.seekThreshold) {
      entered.status = 'done'; // landed in the middle: not seen from its start
      return;
    }
    entered.status = 'playing';
    entered.tracker.firstFrame();
    entered.tracker.progress(time - entered.placed.start);
  }

  paused(): void {
    this.active()?.tracker.paused();
  }

  resumed(): void {
    this.active()?.tracker.resumed();
  }

  /** @returns the content time to seek to (the end of the ad), or null when skip is not allowed yet. */
  skip(): number | null {
    const active = this.active();
    if (!active || !active.tracker.skip()) {
      return null;
    }
    active.status = 'done';
    return active.placed.end;
  }

  current(): StitchedAdState | null {
    const active = this.active();
    if (!active || this.last === null) {
      return null;
    }
    const { placed, tracker } = active;
    return {
      index: placed.index,
      count: placed.count,
      remaining: Math.ceil(placed.end - this.last),
      secondsUntilSkip: tracker.secondsUntilSkip(),
    };
  }
}
