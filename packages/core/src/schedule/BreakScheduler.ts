import type { BreakOffset } from '@vega-ads/vast';

export type Decision = { type: 'prefetch' | 'start'; breakId: string };

export interface SchedulerOptions {
  /** How early to load and buffer the ads of a break (R10). */
  prefetchSeconds?: number;
  /** A jump in content time larger than this is treated as a seek. */
  seekThresholdSeconds?: number;
}

interface Entry {
  id: string;
  offset: BreakOffset;
  /** Content time of a mid-roll, once known. */
  time: number | null;
  prefetched: boolean;
  done: boolean;
}

/**
 * Decides when each break is prefetched and started, from content time only.
 * Every break plays at most once. After a seek forward over mid-rolls, only the
 * last one skipped is played (R24).
 */
export class BreakScheduler {
  private readonly entries: Entry[];
  private readonly prefetchSeconds: number;
  private readonly seekThreshold: number;
  private duration: number | null = null;
  private lastTime: number | null = null;
  private begun = false;

  constructor(breaks: Array<{ id: string; offset: BreakOffset }>, options: SchedulerOptions = {}) {
    this.prefetchSeconds = options.prefetchSeconds ?? 15;
    this.seekThreshold = options.seekThresholdSeconds ?? 3;
    this.entries = breaks.map((b) => ({
      id: b.id,
      offset: b.offset,
      time: b.offset.kind === 'time' ? b.offset.seconds : null,
      prefetched: false,
      done: false,
    }));
  }

  /** Call once before content starts. */
  begin(): Decision[] {
    if (this.begun) {
      return [];
    }
    this.begun = true;
    const pre = this.entries.find((e) => e.offset.kind === 'start' && !e.done);
    return pre ? this.startNow(pre) : [];
  }

  setDuration(seconds: number): void {
    this.duration = seconds;
    for (const entry of this.entries) {
      if (entry.offset.kind === 'percent' && entry.time === null) {
        entry.time = (seconds * entry.offset.percent) / 100;
        // A break placed behind the viewer counts as passed, not as a snap-back target.
        if (this.lastTime !== null && entry.time < this.lastTime) {
          entry.done = true;
        }
      }
      if (entry.time !== null && entry.time >= seconds) {
        entry.done = true;
      }
    }
  }

  onTime(time: number): Decision[] {
    const previous = this.lastTime;
    this.lastTime = time;
    const mids = this.midRolls();

    if (previous !== null && time - previous > this.seekThreshold) {
      const jumped = mids.filter((e) => e.time !== null && e.time > previous && e.time < time);
      const target = jumped[jumped.length - 1];
      jumped.forEach((e) => (e.done = true));
      if (target) {
        return this.startNow(target);
      }
    }

    const decisions: Decision[] = [];
    for (const entry of mids) {
      const at = entry.time as number;
      if (time >= at) {
        decisions.push(...this.startNow(entry));
        break;
      }
      if (!entry.prefetched && time >= at - this.prefetchSeconds) {
        entry.prefetched = true;
        decisions.push({ type: 'prefetch', breakId: entry.id });
      }
    }

    const post = this.entries.find((e) => e.offset.kind === 'end' && !e.prefetched && !e.done);
    if (post && this.duration !== null && time >= this.duration - this.prefetchSeconds) {
      post.prefetched = true;
      decisions.push({ type: 'prefetch', breakId: post.id });
    }
    return decisions;
  }

  /** Content reached its end: start the post-roll. */
  onEnded(): Decision[] {
    const post = this.entries.find((e) => e.offset.kind === 'end' && !e.done);
    return post ? this.startNow(post) : [];
  }

  /** Mark a break as used without playing it (for example, its ad request failed). */
  skip(breakId: string): void {
    this.entries.filter((e) => e.id === breakId).forEach((e) => (e.done = true));
  }

  private midRolls(): Entry[] {
    return this.entries
      .filter((e) => (e.offset.kind === 'time' || e.offset.kind === 'percent') && e.time !== null && !e.done)
      .sort((a, b) => (a.time as number) - (b.time as number));
  }

  private startNow(entry: Entry): Decision[] {
    const decisions: Decision[] = [];
    if (!entry.prefetched) {
      entry.prefetched = true;
      decisions.push({ type: 'prefetch', breakId: entry.id });
    }
    entry.done = true;
    decisions.push({ type: 'start', breakId: entry.id });
    return decisions;
  }
}
