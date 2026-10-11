import { VASTTracker } from '@dailymotion/vast-client';
import type { LinearAd } from '../request/VastRequester';

export type Macros = Record<string, string>;

export interface AdTrackerOptions {
  /** Extra macros for every URL, for example from adIdMacros() (R15). */
  macros?: Macros;
  /** Called with the IAB event name after its pixels are sent. */
  onEvent?: (name: string) => void;
}

const REPORTED = new Set(['start', 'firstQuartile', 'midpoint', 'thirdQuartile', 'complete', 'pause', 'resume', 'skip']);

/**
 * IAB tracking for one linear ad, on top of vast-client's VASTTracker.
 * Adds what the player needs: impression once on the first frame (R1),
 * skip only after skipoffset (R8), error codes (R20), ad id macros (R15),
 * and silence after the ad has ended, been skipped or failed.
 */
export class AdTracker {
  private readonly tracker: VASTTracker;
  private readonly macros: Macros;
  private readonly onEvent: (name: string) => void;
  private readonly skipAfter: number | null;
  private impressed = false;
  private finished = false;
  // vast-client starts with `paused` undefined, so its first setPaused(false) would send "resume".
  private isPaused = false;
  private position = 0;
  private hasDuration: boolean;

  constructor(linear: LinearAd, options: AdTrackerOptions = {}) {
    this.macros = options.macros ?? {};
    this.onEvent = options.onEvent ?? (() => undefined);
    this.skipAfter = linear.skipAfter;
    this.tracker = new VASTTracker(linear.client, linear.ad as never, linear.creative as never);
    this.hasDuration = linear.creative.duration > 0;
    if (this.hasDuration) {
      this.tracker.setDuration(linear.creative.duration);
    }
    const emitter = this.tracker as unknown as { on(event: string, listener: () => void): void };
    REPORTED.forEach((name) => emitter.on(name, () => this.onEvent(name)));
  }

  /** The first frame of the ad is on screen. */
  firstFrame(): void {
    if (this.finished || this.impressed) {
      return;
    }
    this.impressed = true;
    this.tracker.trackImpression(this.macros);
    this.onEvent('impression');
  }

  /**
   * Ad length from the player, for an ad without a valid <Duration>: start and quartiles
   * need it. A valid <Duration> is kept.
   */
  setDuration(seconds: number): void {
    if (!this.hasDuration && seconds > 0) {
      this.hasDuration = true;
      this.tracker.setDuration(seconds);
    }
  }

  /** Current ad position in seconds (R2). */
  progress(seconds: number): void {
    if (this.finished) {
      return;
    }
    this.position = seconds;
    this.tracker.setProgress(seconds, this.macros);
  }

  paused(): void {
    if (!this.finished && !this.isPaused) {
      this.isPaused = true;
      this.tracker.setPaused(true, this.macros);
    }
  }

  resumed(): void {
    if (!this.finished && this.isPaused) {
      this.isPaused = false;
      this.tracker.setPaused(false, this.macros);
    }
  }

  ended(): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.tracker.complete(this.macros);
  }

  canSkip(): boolean {
    return !this.finished && this.skipAfter !== null && this.position >= this.skipAfter;
  }

  secondsUntilSkip(): number | null {
    return this.skipAfter === null ? null : Math.max(0, this.skipAfter - this.position);
  }

  /** @returns true if the skip was allowed and tracked. */
  skip(): boolean {
    if (!this.canSkip()) {
      return false;
    }
    this.finished = true;
    this.tracker.skip(this.macros);
    return true;
  }

  error(code: number): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.tracker.error({ ...this.macros, ERRORCODE: String(code) });
  }
}

export interface AdIdSource {
  isTrackingEnabled(): boolean;
  fetchId(): string;
}

/**
 * Macros for the Fire TV advertising id (R15). Tracking consent is checked
 * before the id is read; any failure counts as opt-out and never stops playback.
 */
export function adIdMacros(source: AdIdSource): Macros {
  const optedOut: Macros = { LIMITADTRACKING: '1', IFA: '', IFATYPE: '' };
  try {
    if (!source.isTrackingEnabled()) {
      return optedOut;
    }
    return { LIMITADTRACKING: '0', IFA: source.fetchId(), IFATYPE: 'afai' };
  } catch {
    return optedOut;
  }
}
