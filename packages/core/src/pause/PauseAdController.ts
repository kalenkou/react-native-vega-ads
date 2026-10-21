import type { PlayerPort } from '../ports';
import { ClockPort, HttpPort, Macros } from '../vast';
import { PauseAd, PauseAdResult, requestPauseAd } from '../vast/request/PauseAdRequester';
import { PauseAdTracker } from '../vast/tracking/PauseAdTracker';

/** What the app draws while the pause ad is on screen. */
export interface PauseAdView {
  imageUrl: string;
  width: number;
  height: number;
  clickThroughUrl: string | null;
  qr: PauseAd['qr'];
}

export interface PauseAdDeps {
  http: HttpPort;
  clock: ClockPort;
  content: PlayerPort;
  /** VAST tag of the pause ad (a `<NonLinear>` image). */
  source: string;
  macros?: Macros;
  /** How many wrappers to follow before giving up with VAST error 302. Default 5 (R3). */
  maxRedirects?: number;
  /** How long the content stays paused before the ad shows. Default 1500 ms. */
  delayMs?: number;
  /** False while a break plays, before the content started and after it ended. */
  canShow: () => boolean;
  /** The ad to draw, or null to remove it. */
  onChange: (view: PauseAdView | null) => void;
  /** `pauseAd:<IAB event>` for each pixel event sent. */
  onEvent?: (name: string) => void;
}

const DEFAULT_DELAY_MS = 1500;

/**
 * Pause ads (IAB CTV Ad Portfolio): when the viewer pauses the content, an image ad shows after
 * a short delay and goes away when the content plays again or the viewer closes it. The ad is
 * requested ahead of time, so a pause never waits for the ad server; a new one is requested
 * after each use.
 */
export class PauseAdController {
  private readonly deps: PauseAdDeps;
  private next: PauseAdResult | null = null;
  private loading = false;
  private timer: unknown = null;
  private current: { tracker: PauseAdTracker; since: number } | null = null;
  private offs: Array<() => void> = [];

  constructor(deps: PauseAdDeps) {
    this.deps = deps;
  }

  start(): void {
    const { content } = this.deps;
    this.offs.push(
      content.on('pause', () => this.onPause()),
      content.on('playing', () => this.onPlaying()),
    );
    this.prefetch();
  }

  /**
   * The viewer asked to pause (a media controls command), also when the player sends no pause
   * event: on Fire TV "Alexa, pause" finds a player the system already froze while Alexa listened.
   */
  viewerPaused(): void {
    this.onPause();
  }

  /** The viewer closed the ad (Back). True when an ad was on screen, so Back is used up. */
  close(): boolean {
    return this.remove(true);
  }

  /** Takes the ad off the screen without the viewer's close (for example, the app went to the background). */
  hide(): void {
    this.cancelTimer();
    this.remove(false);
  }

  dispose(): void {
    this.offs.forEach((off) => off());
    this.offs = [];
    this.hide();
  }

  private prefetch(): void {
    if (this.loading) {
      return;
    }
    this.loading = true;
    const { http, clock, macros, maxRedirects, source } = this.deps;
    void requestPauseAd(source, { http, clock, macros, maxRedirects }).then((result) => {
      this.loading = false;
      this.next = result;
    });
  }

  private onPause(): void {
    if (this.current || this.timer !== null) {
      return;
    }
    // Checked when the delay ends: a break pauses the content too, and play cancels the timer.
    this.timer = this.deps.clock.setTimeout(() => {
      this.timer = null;
      if (this.deps.canShow()) {
        this.show();
      }
    }, this.deps.delayMs ?? DEFAULT_DELAY_MS);
  }

  private onPlaying(): void {
    this.hide();
  }

  private show(): void {
    const ready = this.next;
    this.next = null;
    this.prefetch();
    if (ready?.status !== 'ok') {
      return;
    }
    const { ad } = ready;
    const tracker = new PauseAdTracker(ad, {
      macros: this.deps.macros,
      onEvent: (name) => this.deps.onEvent?.(`pauseAd:${name}`),
    });
    this.current = { tracker, since: this.deps.clock.now() };
    this.deps.onChange({
      imageUrl: ad.imageUrl,
      width: ad.width,
      height: ad.height,
      clickThroughUrl: ad.clickThroughUrl,
      qr: ad.qr,
    });
    tracker.shown();
  }

  private remove(closedByViewer: boolean): boolean {
    const current = this.current;
    if (!current) {
      return false;
    }
    this.current = null;
    this.deps.onChange(null);
    current.tracker.hidden(this.deps.clock.now() - current.since, { closedByViewer });
    return true;
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.deps.clock.clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
