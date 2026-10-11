import { PodController, PodItem } from '../pod/PodController';
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
} from '@vega-ads/vast';
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
  canPlayTimeoutMs?: number;
  /**
   * Back-to-back only: start the next ad this many ms before the current one ends.
   * On Vega a surface turns empty after `ended`, which would show the paused content
   * between two ads; starting early lets the next ad's first frame cover the end.
   */
  handOverLeadMs?: number;
  onChange?: (snapshot: SessionSnapshot) => void;
  /** IAB events sent, plus `error:<code>` and `breakEnd`. */
  onEvent?: (name: string) => void;
}

const MEDIA_LOAD_ERROR = 400;
const MEDIA_NOT_SUPPORTED = 403;
const PLAYBACK_ERROR = 405;

interface Current {
  item: PodItem;
  tracker: AdTracker;
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
  private startedAt = 0;
  private impressed = false;

  constructor(deps: SessionDeps) {
    this.deps = deps;
  }

  /** Requests all sources of the break and prebuffers its first ad (R10). */
  async load(sources: AdSourceRef[]): Promise<'ready' | 'empty'> {
    this.setState('loading');
    const responses: LinearAd[][] = [];
    for (const source of sources) {
      const result = await requestVast(source, { http: this.deps.http, clock: this.deps.clock });
      responses.push(result.status === 'ok' ? result.ads : []);
    }
    this.pod = new PodController(responses, { budgetMs: this.deps.budgetMs });

    for (let item = this.pod.next(0); item; item = this.pod.next(0)) {
      const tracker = this.trackerFor(item.ad);
      const url = this.pickFile(item.ad, tracker);
      if (url && (await this.prebuffer(url))) {
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

  /** Pauses content and shows the prebuffered ad. */
  async start(): Promise<void> {
    if (this.state !== 'ready' || !this.player) {
      throw new Error('ad break not ready');
    }
    const { content } = this.deps;
    this.startedAt = this.deps.clock.now();
    this.savedContentTime = content.getCurrentTime();
    content.pause();
    this.setState('playing');
    const player = this.player;
    await player.play();
    await player.takeMediaControlFocus();
  }

  /** Viewer pressed Skip. @returns false when skipping is not allowed yet (R8). */
  skip(): boolean {
    if (this.state !== 'playing' || !this.current?.tracker.skip()) {
      return false;
    }
    void this.advance();
    return true;
  }

  /** Viewer pressed Back: leave the break without skip or close pixels (R23). */
  async cancel(): Promise<void> {
    if (this.state === 'finished') {
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
    return new AdTracker(ad, { macros: this.deps.macros, onEvent: (name) => this.deps.onEvent?.(name) });
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
    player.on('pause', active(() => this.whilePlaying((c) => c.tracker.paused())));
    player.on('timeupdate', active(() => this.onTime()));
    player.on('timeupdate', finishing(() => this.previous?.tracker.progress(player.getCurrentTime())));
    player.on('ended', active(() => this.whilePlaying((c) => {
      c.tracker.ended();
      void this.advance();
    })));
    player.on('ended', finishing(() => void this.releasePrevious()));
    player.on('error', active(() => this.whilePlaying((c) => {
      this.fail(c.tracker, PLAYBACK_ERROR);
      void this.advance();
    })));
    player.on('error', finishing(() => void this.releasePrevious()));
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
        resolve(false);
      }, this.deps.canPlayTimeoutMs ?? 8000);
      const off = player.on('canplay', () => {
        this.deps.clock.clearTimeout(timer);
        off();
        resolve(true);
      });
    });
    player.setSrc(url);
    return ready;
  }

  private onPlaying(): void {
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
    standby.player.setSrc(url);
  }

  private onTime(): void {
    this.whilePlaying((c) => {
      const time = this.player?.getCurrentTime() ?? 0;
      if (!this.firstFrameHidden) {
        c.tracker.progress(time);
      }
      this.emitChange();
      const remainingMs = (c.item.ad.creative.duration - time) * 1000;
      if (this.standby?.ready && !this.previous && remainingMs <= (this.deps.handOverLeadMs ?? 500)) {
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
    await this.switchTo(standby);
  }

  private async releasePrevious(): Promise<void> {
    const previous = this.previous;
    if (!previous) {
      return;
    }
    this.previous = null;
    previous.tracker.ended();
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

  /** Next ad of the pod, or back to content when the pod is over. */
  private async advance(): Promise<void> {
    const pod = this.pod;
    const player = this.player;
    if (!pod || !player) {
      return;
    }
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
      const tracker = this.trackerFor(item.ad);
      const url = this.pickFile(item.ad, tracker);
      if (!url) {
        continue;
      }
      this.current = { item, tracker };
      player.setAutoplay(true);
      player.setSrc(url);
      this.emitChange();
      await player.play();
      return;
    }
    await this.releasePlayer();
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
    await standby.player.play();
    await standby.player.takeMediaControlFocus();
  }

  private async backToContent(): Promise<void> {
    const { content } = this.deps;
    this.current = null;
    this.setState('resuming');
    content.setCurrentTime(this.savedContentTime);
    await content.play();
    await content.takeMediaControlFocus();
    this.setState('finished');
    this.deps.onEvent?.('breakEnd');
  }

  private async releasePlayer(): Promise<void> {
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
