import { PodController, PodItem } from '../pod/PodController';
import type { RepeatGuard } from '../pod/RepeatGuard';
import {
  AdSourceRef,
  AdTracker,
  ClockPort,
  HttpPort,
  LinearAd,
  Macros,
  MediaFileOptions,
  requestVast,
  selectMediaFile,
  VastResult,
} from '../vast';
import type { PlayerPort } from '../ports';

export type SessionState = 'idle' | 'loading' | 'ready' | 'empty' | 'playing' | 'resuming' | 'interrupted' | 'finished';

export interface SessionSnapshot {
  state: SessionState;
  /** 1-based number of the ad in the break, and how many ads the break has. */
  position: number;
  total: number;
  adTime: number;
  adDuration: number;
  canSkip: boolean;
  /** Seconds until Skip is allowed; null for a non-skippable ad. */
  skipIn: number | null;
  /** The ad surface that must be visible (on top); null when no ad player is active. */
  adSurface: string | null;
}

export interface SessionDeps {
  http: HttpPort;
  clock: ClockPort;
  /** The app's content player; the session pauses it and brings it back. */
  content: PlayerPort;
  /** A fresh player for ads. It is released when the break ends (R12). */
  createAdPlayer: () => PlayerPort;
  /** Handle of the ad surface that sits above the content surface (R11). */
  adSurface: string;
  /**
   * A second ad surface, placed above `adSurface`. When given, the next ad of a pod is
   * prebuffered on the free surface while the current ad plays (back-to-back ads).
   * Keep the upper surface hidden unless the snapshot names it: a prebuffered player
   * shows a still frame.
   */
  standbySurface?: string;
  macros?: Macros;
  mediaFile?: MediaFileOptions;
  budgetMs?: number;
  /** Viewer rules shared by all breaks of the content: no repeats, one ad per advertiser. */
  repeats?: RepeatGuard;
  canPlayTimeoutMs?: number;
  /**
   * Back-to-back only: start the next ad this many ms before the current one ends.
   * On Vega a surface turns empty after `ended`, which would show the paused content
   * between two ads; starting early lets the next ad's first frame cover the end.
   */
  handOverLeadMs?: number;
  /** An ad that shows no frame this long after play() fails with 405 (goal 7). Default 5000. */
  playTimeoutMs?: number;
  /** A buffering ad (`waiting`) whose time does not move this long fails with 405. Default 10000. */
  stallTimeoutMs?: number;
  /**
   * A playing ad whose time stops with no media event at all fails with 405 after this long.
   * Default 30000: on Fire TV the picture stops silently while the viewer talks to Alexa.
   */
  silentStallTimeoutMs?: number;
  onChange?: (snapshot: SessionSnapshot) => void;
  /** IAB events sent, plus `error:<code>`, `skipped:repeat`, `skipped:advertiser` and `breakEnd`. */
  onEvent?: (name: string) => void;
}

const MEDIA_LOAD_ERROR = 400;
const MEDIA_NOT_SUPPORTED = 403;
const PLAYBACK_ERROR = 405;

/**
 * pause() is not instant: the content may play on for a moment, so the break seeks it back to
 * where it paused. A smaller difference is not worth a seek (a seek re-buffers, and a player that
 * has never played, before a pre-roll, should simply start).
 */
const RESUME_SEEK_TOLERANCE_S = 0.25;

interface Current {
  item: PodItem;
  tracker: AdTracker;
  /** Media controls already point at this ad's player. */
  focused?: boolean;
}

interface Standby {
  player: PlayerPort;
  surface: string;
  item: PodItem;
  ready: boolean;
}

/**
 * One ad break, from loading to returning to content:
 * idle → loading → ready → playing (ad after ad) → resuming → finished.
 * Any failure moves on to the next ad or back to content; the viewer
 * always gets the content back (goal 7 of the spec).
 */
export class AdBreakSession {
  state: SessionState = 'idle';
  private readonly deps: SessionDeps;
  private pod: PodController | null = null;
  private player: PlayerPort | null = null;
  private playerSurface: string | null = null;
  /** The surface on screen. It changes only when the new ad shows its first frame. */
  private shownSurface: string | null = null;
  /** After an early hand-over, the ad that is still finishing its last fraction of a second. */
  private previous: { player: PlayerPort; tracker: AdTracker } | null = null;
  private previousReleased: () => void = () => undefined;
  /** Set when the device could not start a second ad player; then the break uses one. */
  private standbyUnavailable = false;
  /** The active ad already plays but is still hidden under the finishing one. */
  private firstFrameHidden = false;
  private standby: Standby | null = null;
  private releasing: Promise<void> = Promise.resolve();
  private current: Current | null = null;
  private savedContentTime = 0;
  private resumeContentAfter = true;
  private startedAt = 0;
  private impressed = false;
  /** The active player reported an error before the break started. */
  private brokenWhileReady = false;
  /** The ad is paused: set at once by togglePause (intent), and by the player's pause/playing events. */
  private adPaused = false;
  /** The current ad has shown its first frame. */
  private framed = false;
  /** The ad player reported `waiting` and has not moved since. */
  private buffering = false;
  private watchdog: unknown = null;
  /** The ad that advance() already moved on from: a second event of the same ad is late. */
  private advancedFrom: Current | null = null;
  private previousTimer: unknown = null;

  constructor(deps: SessionDeps) {
    this.deps = deps;
  }

  /**
   * Requests all sources of the break and prebuffers its first ad (R10). `preloaded` holds
   * answers already received for the sources, in the same order (see preloadAds()); a source
   * whose preloaded request failed is asked again.
   */
  async load(sources: AdSourceRef[], preloaded: readonly VastResult[] = []): Promise<'ready' | 'empty'> {
    this.setState('loading');
    const responses: LinearAd[][] = [];
    for (const [index, source] of sources.entries()) {
      const ready = preloaded[index];
      const result =
        ready && ready.status !== 'failed'
          ? ready
          : await requestVast(source, { http: this.deps.http, clock: this.deps.clock, macros: this.deps.macros });
      if (this.state !== 'loading') {
        return 'empty'; // interrupted while the ad server answered
      }
      responses.push(result.status === 'ok' ? result.ads : []);
    }
    this.pod = new PodController(this.withoutRepeats(responses), { budgetMs: this.deps.budgetMs });

    for (let item = this.pod.next(0); item; item = this.pod.next(0)) {
      const tracker = this.trackerFor(item.ad);
      const url = this.pickFile(item.ad, tracker);
      const buffered = url !== null && (await this.prebuffer(url));
      if (this.state !== 'loading') {
        await this.releasePlayer();
        return 'empty';
      }
      if (buffered) {
        this.current = { item, tracker };
        this.setState('ready');
        return 'ready';
      }
      if (url) {
        this.fail(tracker, MEDIA_LOAD_ERROR);
        await this.releasePlayer();
      }
    }
    this.setState('empty');
    return 'empty';
  }

  /**
   * Pauses content and shows the prebuffered ad.
   * `resumeContent: false` (post-roll): the content has ended, so it is not played again.
   */
  async start(options: { resumeContent?: boolean } = {}): Promise<void> {
    if (this.state !== 'ready' || !this.player) {
      throw new Error('ad break not ready');
    }
    this.resumeContentAfter = options.resumeContent ?? true;
    const { content } = this.deps;
    this.startedAt = this.deps.clock.now();
    this.savedContentTime = content.getCurrentTime();
    content.pause();
    this.setState('playing');
    const player = this.player;
    if (this.brokenWhileReady && this.current) {
      this.fail(this.current.tracker, PLAYBACK_ERROR);
      await this.advance(this.current);
      return;
    }
    this.armWatchdog();
    await player.play();
  }

  /** Viewer pressed Skip. @returns false when skipping is not allowed yet (R8). */
  skip(): boolean {
    const current = this.current;
    if (this.state !== 'playing' || !current?.tracker.skip()) {
      return false;
    }
    void this.advance(current);
    return true;
  }

  /**
   * Play/pause from the app's own remote handler (for apps without the media
   * controls manifest entries). @returns false outside the ad.
   */
  togglePause(): boolean {
    const player = this.player;
    if (this.state !== 'playing' || !player) {
      return false;
    }
    // Decide by intent, not by the late native event: two quick presses must pause and resume.
    this.adPaused = !this.adPaused;
    if (this.adPaused) {
      player.pause();
      this.disarmWatchdog();
    } else {
      void player.play();
      if (this.framed) {
        this.armStallWatchdog();
      } else {
        this.armWatchdog();
      }
    }
    return true;
  }

  /** Viewer pressed Back: leave the break without skip or close pixels (R23). */
  async cancel(): Promise<void> {
    // Only an ad on screen can be left; before start() or after the break there is nothing to do.
    if (this.state !== 'playing') {
      return;
    }
    await this.releasePlayer();
    await this.backToContent();
  }

  /** App went to the background: free the ad player and wait (R13). */
  async interrupt(): Promise<{ impressed: boolean }> {
    await this.releasePlayer();
    this.setState('interrupted');
    return { impressed: this.impressed };
  }

  async resumeContent(): Promise<void> {
    await this.backToContent();
  }

  private trackerFor(ad: LinearAd): AdTracker {
    return new AdTracker(ad, {
      macros: this.deps.macros,
      onEvent: (name) => {
        if (name === 'impression') {
          this.deps.repeats?.shown(ad);
        }
        this.deps.onEvent?.(name);
      },
    });
  }

  /** Drops the ads the viewer rules do not allow; the ad server hears `notUsed` for each. */
  private withoutRepeats(responses: LinearAd[][]): LinearAd[][] {
    if (!this.deps.repeats) {
      return responses;
    }
    const { responses: kept, dropped } = this.deps.repeats.filter(responses);
    dropped.forEach(({ ad, reason }) => {
      this.trackerFor(ad).notUsed();
      this.deps.onEvent?.(`skipped:${reason}`);
    });
    return kept;
  }

  private pickFile(ad: LinearAd, tracker: AdTracker): string | null {
    const choice = selectMediaFile(ad.creative.mediaFiles, this.deps.mediaFile);
    if (choice.file?.fileURL) {
      return choice.file.fileURL;
    }
    this.fail(tracker, MEDIA_NOT_SUPPORTED);
    return null;
  }

  private fail(tracker: AdTracker, code: number): void {
    tracker.error(code);
    this.deps.onEvent?.(`error:${code}`);
    this.pod?.fail();
  }

  /** A new ad player on a surface. Its events count only while it is the active player. */
  private async createPlayer(surface: string): Promise<PlayerPort> {
    const player = this.deps.createAdPlayer();
    await player.initialize();
    player.attachSurface(surface);
    const active = (action: () => void) => () => {
      if (this.player === player) {
        action();
      }
    };
    const finishing = (action: () => void) => () => {
      if (this.previous?.player === player) {
        action();
      }
    };
    player.on('playing', active(() => this.onPlaying()));
    player.on('pause', active(() => {
      this.adPaused = true;
      // A pause (remote, voice or app) is not a stuck player.
      this.disarmWatchdog();
      // HTML media at its end sends pause, then ended: that is not a viewer pause.
      const duration = player.getDuration();
      if (duration > 0 && player.getCurrentTime() >= duration - 0.25) {
        return;
      }
      this.whilePlaying((c) => c.tracker.paused());
    }));
    player.on('waiting', active(() => {
      this.buffering = true;
      if (this.framed && !this.adPaused) {
        this.armStallWatchdog();
      }
    }));
    player.on('timeupdate', active(() => this.onTime()));
    player.on('timeupdate', finishing(() => this.previous?.tracker.progress(player.getCurrentTime())));
    player.on('ended', active(() => this.whilePlaying((c) => {
      // An ended before the ad's first frame belongs to the source before it (late event after Skip).
      if (!this.framed) {
        return;
      }
      c.tracker.ended();
      void this.advance(c);
    })));
    player.on('ended', finishing(() => void this.releasePrevious()));
    player.on('error', active(() => {
      if (this.state === 'ready') {
        this.brokenWhileReady = true;
      }
      this.whilePlaying((c) => {
        if (this.advancedFrom === c) {
          return;
        }
        this.fail(c.tracker, PLAYBACK_ERROR);
        void this.advance(c);
      });
    }));
    player.on('error', finishing(() => void this.releasePrevious(PLAYBACK_ERROR)));
    return player;
  }

  private async ensurePlayer(): Promise<PlayerPort> {
    if (!this.player) {
      this.player = await this.createPlayer(this.deps.adSurface);
      this.playerSurface = this.deps.adSurface;
      this.shownSurface = this.deps.adSurface;
    }
    return this.player;
  }

  private async prebuffer(url: string): Promise<boolean> {
    const player = await this.ensurePlayer();
    player.setAutoplay(false);
    const ready = new Promise<boolean>((resolve) => {
      const timer = this.deps.clock.setTimeout(() => {
        off();
        offError();
        resolve(false);
      }, this.deps.canPlayTimeoutMs ?? 8000);
      const done = (ok: boolean) => () => {
        this.deps.clock.clearTimeout(timer);
        off();
        offError();
        resolve(ok);
      };
      const off = player.on('canplay', done(true));
      // A media error before canplay (missing file, bad codec) fails the ad at once.
      const offError = player.on('error', done(false));
    });
    player.setSrc(url);
    return ready;
  }

  /** Fails the current ad if it shows no frame in time; a dead player must not hold the break. */
  private armWatchdog(): void {
    this.framed = false;
    this.buffering = false;
    this.setWatchdog(this.deps.playTimeoutMs ?? 5000);
  }

  /**
   * Fails the current ad if its time stops moving while it plays. A buffering player gets the
   * short timeout; a silent stop (no event, as during an Alexa request) gets the long one.
   */
  private armStallWatchdog(): void {
    this.setWatchdog(this.buffering ? (this.deps.stallTimeoutMs ?? 10_000) : (this.deps.silentStallTimeoutMs ?? 30_000));
  }

  private setWatchdog(ms: number): void {
    this.disarmWatchdog();
    const current = this.current;
    this.watchdog = this.deps.clock.setTimeout(() => {
      this.watchdog = null;
      if (this.current === current && current && this.state === 'playing') {
        this.fail(current.tracker, PLAYBACK_ERROR);
        void this.advance(current);
      }
    }, ms);
  }

  private disarmWatchdog(): void {
    if (this.watchdog !== null) {
      this.deps.clock.clearTimeout(this.watchdog);
      this.watchdog = null;
    }
  }

  private onPlaying(): void {
    this.adPaused = false;
    this.framed = true;
    this.armStallWatchdog();
    this.whilePlaying((c) => {
      if (this.shownSurface !== this.playerSurface) {
        // Fire TV rule: no impression for an ad that is not visible yet. See releasePrevious().
        this.firstFrameHidden = true;
        this.emitChange();
        if (this.deps.standbySurface && !this.standby) {
          void this.prepareStandby(c);
        }
        return;
      }
      this.impressed = true;
      c.tracker.firstFrame();
      c.tracker.resumed();
      this.emitChange();
      if (this.deps.standbySurface && !this.standby) {
        void this.prepareStandby(c);
      }
    });
    this.whilePlaying((c) => this.focusMediaControls(c));
  }

  /**
   * Points media controls at the ad's player once, after its first frame is tracked:
   * on a cold start the call blocks the JS thread for 1-2 s, which would hold back
   * the impression and start pixels.
   */
  private focusMediaControls(c: Current): void {
    if (c.focused) {
      return;
    }
    c.focused = true;
    const player = this.player;
    this.deps.clock.setTimeout(() => {
      if (this.current === c && this.player === player && player) {
        player.takeMediaControlFocus().catch(() => undefined);
      }
    }, 0);
  }

  /** Prebuffers the ad that will follow the current one on the free ad surface. */
  private async prepareStandby(current: Current): Promise<void> {
    const pod = this.pod;
    const standbySurface = this.deps.standbySurface;
    if (!pod || !standbySurface || this.standbyUnavailable) {
      return;
    }
    const remainingMs = Math.max(0, current.item.ad.creative.duration - (this.player?.getCurrentTime() ?? 0)) * 1000;
    const item = pod.peek(this.deps.clock.now() - this.startedAt + remainingMs);
    const url = item ? selectMediaFile(item.ad.creative.mediaFiles, this.deps.mediaFile).file?.fileURL : null;
    if (!item || !url) {
      return;
    }
    const surface = this.playerSurface === standbySurface ? this.deps.adSurface : standbySurface;
    await this.releasing;
    if (this.current !== current || this.standby) {
      return;
    }
    let player: PlayerPort;
    try {
      player = await this.createPlayer(surface);
    } catch {
      // For example, no free video decoder on a smaller device.
      this.standbyUnavailable = true;
      this.deps.onEvent?.('standby:unavailable');
      return;
    }
    if (this.current !== current || this.standby || this.state !== 'playing') {
      await player.deinitialize();
      return;
    }
    const standby: Standby = { player, surface, item, ready: false };
    this.standby = standby;
    standby.player.setAutoplay(false);
    const off = standby.player.on('canplay', () => {
      off();
      standby.ready = true;
    });
    // A standby that breaks is dropped; its ad then plays on the current player.
    standby.player.on('error', () => {
      if (this.standby === standby) {
        this.standby = null;
        this.deps.onEvent?.('standby:error');
        void standby.player.deinitialize();
      }
    });
    standby.player.setSrc(url);
  }

  private onTime(): void {
    this.whilePlaying((c) => {
      const time = this.player?.getCurrentTime() ?? 0;
      this.buffering = false;
      if (this.framed && !this.adPaused) {
        this.armStallWatchdog();
      }
      // Without a valid <Duration>, start and quartiles use the length the player reports.
      if (c.item.ad.creative.duration <= 0) {
        c.tracker.setDuration(this.player?.getDuration() ?? 0);
      }
      if (!this.firstFrameHidden) {
        c.tracker.progress(time);
      }
      this.emitChange();
      // Trust <Duration>; without it, the length the player reports.
      const vastDuration = c.item.ad.creative.duration;
      const duration = vastDuration > 0 ? vastDuration : (this.player?.getDuration() ?? 0);
      const remainingMs = (duration - time) * 1000;
      if (duration > 0 && this.standby?.ready && !this.previous && remainingMs <= (this.deps.handOverLeadMs ?? 500)) {
        void this.handOver(c, remainingMs);
      }
    });
  }

  /** Starts the prebuffered next ad while the current one plays its last moments. */
  private async handOver(current: Current, remainingMs: number): Promise<void> {
    const standby = this.standby;
    const pod = this.pod;
    const player = this.player;
    const elapsed = this.deps.clock.now() - this.startedAt + remainingMs;
    if (!standby || !pod || !player || pod.peek(elapsed)?.ad !== standby.item.ad) {
      return;
    }
    pod.next(elapsed);
    this.standby = null;
    this.previous = { player, tracker: current.tracker };
    // One sound at a time: the finishing ad keeps playing for its pixels, silently.
    player.setMuted(true);
    this.releasing = new Promise((resolve) => (this.previousReleased = resolve));
    // A finishing ad that never sends ended must not cover the active one.
    const previous = this.previous;
    this.previousTimer = this.deps.clock.setTimeout(() => {
      this.previousTimer = null;
      if (this.previous === previous) {
        void this.releasePrevious();
      }
    }, Math.max(0, remainingMs) + 1000);
    await this.switchTo(standby);
  }

  /** @param errorCode set when the finishing ad failed instead of ending. */
  private async releasePrevious(errorCode?: number): Promise<void> {
    const previous = this.previous;
    if (!previous) {
      return;
    }
    this.previous = null;
    this.clearPreviousTimer();
    if (errorCode === undefined) {
      previous.tracker.ended();
    } else {
      // Not fail(): the pod has already moved on to the active ad.
      previous.tracker.error(errorCode);
      this.deps.onEvent?.(`error:${errorCode}`);
    }
    // The finished ad's surface is empty now; the active ad is the one to show.
    this.shownSurface = this.playerSurface;
    if (this.firstFrameHidden && this.current) {
      this.firstFrameHidden = false;
      this.impressed = true;
      this.current.tracker.firstFrame();
      this.current.tracker.progress(this.player?.getCurrentTime() ?? 0);
    }
    this.emitChange();
    await previous.player.deinitialize();
    this.previousReleased();
  }

  private whilePlaying(action: (current: Current) => void): void {
    if (this.state === 'playing' && this.current) {
      action(this.current);
    }
  }

  /**
   * Next ad of the pod after `from`, or back to content when the pod is over.
   * Skip, ended, an error and the watchdog can all ask for the same ad: only the first counts.
   */
  private async advance(from: Current): Promise<void> {
    const pod = this.pod;
    const player = this.player;
    if (!pod || !player || this.advancedFrom === from || this.current !== from) {
      return;
    }
    this.advancedFrom = from;
    const elapsed = this.deps.clock.now() - this.startedAt;
    for (let item = pod.next(elapsed); item; item = pod.next(elapsed)) {
      const standby = this.standby;
      this.standby = null;
      if (standby && standby.ready && standby.item.ad === item.ad) {
        // The current ad already ended, so its surface is empty: release it at once.
        this.releasing = player.deinitialize();
        await this.switchTo(standby);
        return;
      }
      if (standby) {
        await standby.player.deinitialize();
      }
      if (this.state !== 'playing') {
        return;
      }
      const tracker = this.trackerFor(item.ad);
      const url = this.pickFile(item.ad, tracker);
      if (!url) {
        continue;
      }
      this.current = { item, tracker };
      player.setAutoplay(true);
      player.setSrc(url);
      this.emitChange();
      this.armWatchdog();
      await player.play();
      return;
    }
    await this.releasePlayer();
    if (this.state !== 'playing') {
      return; // interrupted (Home) or cancelled (Back) while the player was released
    }
    await this.backToContent();
  }

  /**
   * Back-to-back: the prebuffered player becomes the active one.
   * The standby surface lies above the first one. Going up, show it at once so it covers
   * the end of the previous ad. Going down, keep the upper surface until its ad ends:
   * an ended surface is transparent and the lower ad shows through.
   */
  private async switchTo(standby: Standby): Promise<void> {
    this.player = standby.player;
    this.playerSurface = standby.surface;
    if (standby.surface === this.deps.standbySurface || !this.previous) {
      this.shownSurface = standby.surface;
    }
    this.current = { item: standby.item, tracker: this.trackerFor(standby.item.ad) };
    this.emitChange();
    this.armWatchdog();
    await standby.player.play();
  }

  private async backToContent(): Promise<void> {
    const { content } = this.deps;
    this.current = null;
    this.setState('resuming');
    if (this.resumeContentAfter) {
      if (Math.abs(content.getCurrentTime() - this.savedContentTime) > RESUME_SEEK_TOLERANCE_S) {
        content.setCurrentTime(this.savedContentTime);
      }
      await content.play();
    }
    await content.takeMediaControlFocus();
    this.setState('finished');
    this.deps.onEvent?.('breakEnd');
  }

  private clearPreviousTimer(): void {
    if (this.previousTimer !== null) {
      this.deps.clock.clearTimeout(this.previousTimer);
      this.previousTimer = null;
    }
  }

  private async releasePlayer(): Promise<void> {
    this.disarmWatchdog();
    this.clearPreviousTimer();
    const players = [this.player, this.standby?.player, this.previous?.player];
    this.player = null;
    this.playerSurface = null;
    this.shownSurface = null;
    this.standby = null;
    this.previous = null;
    for (const player of players) {
      if (player) {
        await player.deinitialize();
      }
    }
    // The finishing player is gone too: whoever waits for it must not wait forever.
    this.previousReleased();
  }

  private setState(state: SessionState): void {
    this.state = state;
    this.emitChange();
  }

  private emitChange(): void {
    const current = this.current;
    this.deps.onChange?.({
      state: this.state,
      position: current?.item.position ?? 0,
      total: current?.item.total ?? this.pod?.total ?? 0,
      adTime: this.player?.getCurrentTime() ?? 0,
      adDuration: current?.item.ad.creative.duration ?? 0,
      canSkip: current?.tracker.canSkip() ?? false,
      skipIn: current?.tracker.secondsUntilSkip() ?? null,
      adSurface: this.player ? this.shownSurface : null,
    });
  }
}
