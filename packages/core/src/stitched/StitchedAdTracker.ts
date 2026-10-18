import { PodController } from '../pod/PodController';
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

/** One VMAP break of a stitched stream: its time offset and the ads in it, in play order. */
export interface StitchedBreak {
  readonly offset: BreakOffset;
  readonly ads: readonly LinearAd[];
}

/**
 * The breaks of a VMAP for a stream that already contains its ads (server-side ad insertion).
 * Each break gets the ads a client-side break would play: one ad where the VMAP source has
 * `allowMultipleAds="false"`, a pod in its `sequence` order, and only the first ad of a response
 * without sequence numbers. A break whose VAST fails has no ads.
 */
export async function loadStitchedBreaks(
  vmapUrl: string,
  deps: VastRequestDeps & { macros?: Macros },
): Promise<StitchedBreak[]> {
  const vmap = await requestVmap(vmapUrl, deps);
  if (vmap.status !== 'ok') {
    return [];
  }
  const breaks: StitchedBreak[] = [];
  for (const adBreak of vmap.breaks) {
    const responses: LinearAd[][] = [];
    for (const { source, allowMultipleAds } of adBreak.sources) {
      const result = await requestVast(source, deps);
      const ads = result.status === 'ok' ? result.ads : [];
      responses.push(allowMultipleAds ? ads : inPlayOrder([ads]).slice(0, 1));
    }
    breaks.push({ offset: adBreak.offset, ads: inPlayOrder(responses) });
  }
  return breaks;
}

/** The ads of one break as the client-side pod plays them. */
function inPlayOrder(responses: LinearAd[][]): LinearAd[] {
  const pod = new PodController(responses);
  const ads: LinearAd[] = [];
  for (let item = pod.next(); item; item = pod.next()) ads.push(item.ad);
  return ads;
}

/**
 * Places the breaks on the stitched stream. The break times are positions in that stream, ads
 * included. `start` is 0, `n%` is a share of `streamSeconds`, and `end` puts the break's ads at
 * the very end of the stream; without a known length (NaN or 0) those two kinds are left out.
 */
export function placeStitchedBreaks(breaks: readonly StitchedBreak[], streamSeconds: number): StitchedAd[] {
  const known = Number.isFinite(streamSeconds) && streamSeconds > 0;
  const placed: StitchedAd[] = [];
  for (const { offset, ads } of breaks) {
    const length = ads.reduce((sum, ad) => sum + ad.creative.duration, 0);
    const at = breakSeconds(offset, known ? streamSeconds : null, length);
    if (at !== null) placed.push(...stitchedBreak(at, ads));
  }
  return placed;
}

/** `loadStitchedBreaks` and `placeStitchedBreaks` in one step. */
export async function loadStitchedAds(
  vmapUrl: string,
  deps: VastRequestDeps & { macros?: Macros },
  streamSeconds: number,
): Promise<StitchedAd[]> {
  return placeStitchedBreaks(await loadStitchedBreaks(vmapUrl, deps), streamSeconds);
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
  /** Whole seconds until skip is allowed, 0 when it is; null: the ad cannot be skipped. */
  secondsUntilSkip: number | null;
}

export interface StitchedOptions extends AdTrackerOptions {
  /** A time step larger than this (seconds) is a seek, not playback. Default 2. */
  seekThreshold?: number;
}

type Status = 'waiting' | 'playing' | 'done';
type Item = { placed: StitchedAd; tracker: AdTracker; status: Status };

/** A pause this close to the end of an ad is the player's own, just before `ended`. */
const END_PAUSE_SECONDS = 0.5;

/**
 * IAB tracking for ads stitched into the stream by the server: no player switch, the content
 * time alone says which ad plays. Feed it every content time update.
 *
 * Rules: an ad counts only when playback enters it at its start (a seek to the break start
 * counts; a seek into the middle of an ad does not, so no quartile is reported unseen). A seek
 * out of an ad ends its tracking without complete. Each ad is tracked once.
 */
export class StitchedAdTracker {
  private items: Item[] = [];
  private readonly seekThreshold: number;
  private last: number | null = null;

  constructor(
    ads: readonly StitchedAd[],
    private readonly options: StitchedOptions = {},
  ) {
    this.seekThreshold = options.seekThreshold ?? 2;
    this.place(ads);
  }

  /**
   * Moves the ads to new places, for example once the stream length is known and the `n%` and
   * `end` breaks can be placed. An ad that was placed before keeps its progress and its pixels.
   */
  place(ads: readonly StitchedAd[]): void {
    const before = new Map(this.items.map((item) => [item.placed.ad, item]));
    this.items = ads.map((placed) => {
      const old = before.get(placed.ad);
      return old ? { ...old, placed } : { placed, tracker: new AdTracker(placed.ad, this.options), status: 'waiting' };
    });
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
    const active = this.active();
    if (active && this.last !== null && active.placed.end - this.last > END_PAUSE_SECONDS) {
      active.tracker.paused();
    }
  }

  resumed(): void {
    this.active()?.tracker.resumed();
  }

  /**
   * The stream ended. An ad that played to within the seek threshold of its end completes (the
   * last time update can come a little before the end); any other ad just ends.
   */
  streamEnded(): void {
    const active = this.active();
    if (!active) {
      return;
    }
    if (this.last !== null && active.placed.end - this.last <= this.seekThreshold) {
      active.tracker.ended();
    }
    active.status = 'done';
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
    const wait = tracker.secondsUntilSkip();
    return {
      index: placed.index,
      count: placed.count,
      remaining: Math.ceil(placed.end - this.last),
      secondsUntilSkip: wait === null ? null : Math.ceil(wait),
    };
  }
}
