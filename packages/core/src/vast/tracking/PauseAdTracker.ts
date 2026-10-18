import { VASTTracker } from '@dailymotion/vast-client';
import type { PauseAd } from '../request/PauseAdRequester';
import type { AdTrackerOptions, Macros } from './AdTracker';

/** VAST time, `hh:mm:ss.mmm`, for [ADPLAYHEAD] in overlayViewDuration. */
function vastTime(ms: number): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  const total = Math.max(0, Math.round(ms));
  return `${pad(Math.floor(total / 3_600_000))}:${pad(Math.floor(total / 60_000) % 60)}:${pad(Math.floor(total / 1000) % 60)}.${pad(total % 1000, 3)}`;
}

/**
 * IAB tracking for one pause ad, as in the IAB CTV Ad Portfolio sample: impression and
 * creativeView when it shows, overlayViewDuration when it goes, close when the viewer closed it.
 */
export class PauseAdTracker {
  private readonly tracker: VASTTracker;
  private readonly macros: Macros;
  private readonly onEvent: (name: string) => void;
  private state: 'new' | 'shown' | 'done' = 'new';

  constructor(pauseAd: PauseAd, options: AdTrackerOptions = {}) {
    this.macros = options.macros ?? {};
    this.onEvent = options.onEvent ?? (() => undefined);
    this.tracker = new VASTTracker(
      pauseAd.client,
      pauseAd.ad as never,
      pauseAd.creative as never,
      pauseAd.variation as never,
    );
  }

  shown(): void {
    if (this.state !== 'new') {
      return;
    }
    this.state = 'shown';
    this.tracker.trackImpression({ ...this.macros });
    this.onEvent('impression');
    this.onEvent('creativeView');
  }

  /** The ad left the screen after `durationMs`; `closedByViewer` when the viewer closed it (Back). */
  hidden(durationMs: number, { closedByViewer }: { closedByViewer: boolean }): void {
    if (this.state !== 'shown') {
      return;
    }
    this.state = 'done';
    this.tracker.overlayViewDuration(vastTime(durationMs), { ...this.macros });
    this.onEvent('overlayViewDuration');
    if (closedByViewer) {
      this.tracker.close({ ...this.macros });
      this.onEvent('close');
    }
  }
}
