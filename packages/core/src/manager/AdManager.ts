import { ClockPort, HttpPort, Macros, MediaFileOptions, ScheduledBreak, VastResult, VmapTrackingEvent } from '../vast';
import { AdBreakSession, SessionSnapshot } from '../machine/AdBreakSession';
import { BreakMark, BreakScheduler, Decision } from '../schedule/BreakScheduler';
import type { PlayerPort } from '../ports';
import { RepeatGuard, RepeatOptions } from '../pod/RepeatGuard';
import { PauseAdController, PauseAdView } from '../pause/PauseAdController';
import { PreloadedAds, resolveSchedule, scheduleKey } from './preloadAds';

/** Where the breaks come from: a VMAP document, or a list of VAST tags with their times. */
export type AdSchedule =
  | { vmapUrl: string }
  | { breaks: Array<{ offset: 'start' | 'end' | number; vastUrl: string }> };

export interface AdManagerDeps {
  http: HttpPort;
  clock: ClockPort;
  /** The app's content player, initialized, with autoplay off: the manager starts it. */
  content: PlayerPort;
  createAdPlayer: () => PlayerPort;
  adSurface: string;
  standbySurface?: string;
  macros?: Macros;
  mediaFile?: MediaFileOptions;
  prefetchSeconds?: number;
  /** The snapshot of the break on screen, or IDLE_SNAPSHOT between breaks. */
  onChange?: (snapshot: SessionSnapshot) => void;
  /** Session events plus `vmap:error:<code>` and `break:<id>:late`. */
  onEvent?: (name: string) => void;
  /** The breaks on the content timeline and the countdown to the next one; called on changes only. */
  onTimeline?: (timeline: AdTimeline) => void;
  /** How many seconds before a mid-roll the countdown starts. Default 5. */
  countdownSeconds?: number;
  /**
   * Viewer rules for all breaks of this content, on by default: a creative is not shown again
   * within `withinMs` (default 30 minutes), and a break has one copy of each creative and one ad
   * per advertiser. A dropped ad sends its `notUsed` pixels. `false` turns the rules off.
   */
  avoidRepeats?: false | RepeatOptions;
  /** At most this many ads in a break. Sent to the ad server as `[BREAKMAXADS]` (VAST 4.2). */
  maxBreakAds?: number;
  /**
   * A break never runs longer than this: an ad that would end later is not started. Sent to the
   * ad server as `[BREAKMAXDURATION]` (VAST 4.2). Ads left out send their `notUsed` pixels.
   */
  maxBreakSeconds?: number;
  /**
   * VAST tag of a pause ad (IAB CTV Ad Portfolio): a `<NonLinear>` image shown when the viewer
   * pauses the content, never when a break pauses it. Requested ahead of time.
   */
  pauseAdUrl?: string;
  /** How long the content stays paused before the pause ad shows. Default 1500 ms. */
  pauseAdDelayMs?: number;
  /** The pause ad to draw, or null to remove it. */
  onPauseAd?: (view: PauseAdView | null) => void;
}

const positive = (value: number | undefined): number | undefined =>
  value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;

/** What a player UI shows outside the breaks: marks on its timeline and «Ad in 5». */
export interface AdTimeline {
  marks: BreakMark[];
  /**
   * Whole seconds to the next mid-roll, only in the last `countdownSeconds` and only when its
   * ads are loaded (a warning must not promise a break that will not come); otherwise null.
   */
  nextBreakIn: number | null;
}

export const IDLE_SNAPSHOT: SessionSnapshot = Object.freeze({
  state: 'idle',
  position: 0,
  total: 0,
  adTime: 0,
  adDuration: 0,
  canSkip: false,
  skipIn: null,
  adSurface: null,
});

/** VMAP error: the ad source of the break gave no playable ad. */
const VMAP_EMPTY_RESPONSE = 1009;

/** A preload older than this is not used: ad servers do not promise their answers stay valid longer. */
const PRELOAD_MAX_AGE_MS = 5 * 60 * 1000;

interface Prepared {
  session: AdBreakSession;
  loading: Promise<'ready' | 'empty'>;
  loaded: boolean;
  ready: boolean;
}

/**
 * All breaks of one piece of content: reads the schedule, prefetches each break
 * ahead of time, pauses the content for it and brings the content back.
 */
export class AdManager {
  private readonly deps: AdManagerDeps;
  private scheduler: BreakScheduler | null = null;
  private readonly breaks = new Map<string, ScheduledBreak>();
  private readonly prepared = new Map<string, Prepared>();
  /** VAST answers from preloadAds(), by break; used once, by the first load of that break. */
  private readonly preloadedVast = new Map<string, VastResult[]>();
  private active: AdBreakSession | null = null;
  private activeId: string | null = null;
  /** Breaks whose start waits for their ads to load: not "passed", even though the scheduler marked them done. */
  private readonly starting = new Set<string>();
  /** A break interrupted by the app going to the background. */
  private suspended: { id: string; session: AdBreakSession } | null = null;
  /** The app is in the background: a break that finishes loading now must not start. */
  private background = false;
  /** A break whose start the background cut off before it was shown; wake() starts the content instead. */
  private cutOff: string | null = null;
  private contentStarted = false;
  private contentEnded = false;
  private pauseAds: PauseAdController | null = null;
  private impressed = false;
  private disposed = false;
  private durationKnown = false;
  private timeline = '';
  private readonly offs: Array<() => void> = [];

  private readonly repeats: RepeatGuard | undefined;
  private readonly maxAds: number | undefined;
  private readonly maxSeconds: number | undefined;
  /** The app's macros plus the break limits, for every ad request and pixel. */
  private readonly macros: Macros | undefined;

  constructor(deps: AdManagerDeps) {
    this.deps = deps;
    this.repeats = deps.avoidRepeats === false ? undefined : new RepeatGuard(deps.clock, deps.avoidRepeats);
    this.maxAds = positive(deps.maxBreakAds);
    this.maxSeconds = positive(deps.maxBreakSeconds);
    const limits: Macros = {};
    if (this.maxAds !== undefined) limits.BREAKMAXADS = String(Math.floor(this.maxAds));
    if (this.maxSeconds !== undefined) limits.BREAKMAXDURATION = String(Math.floor(this.maxSeconds));
    this.macros = deps.macros || Object.keys(limits).length > 0 ? { ...deps.macros, ...limits } : undefined;
  }

  /**
   * Reads the schedule, plays the pre-roll if there is one, otherwise starts the content.
   * `resumeAt` continues a viewing that was interrupted: no pre-roll, no earlier breaks.
   * `preloaded` (from preloadAds()) saves the VMAP and pre-roll requests when it is for the same
   * schedule and at most five minutes old; a resumed viewing does not use it.
   * Never rejects: on failure the content plays and `error:start` is reported.
   */
  async start(
    schedule: AdSchedule,
    options: { resumeAt?: number; preloaded?: Promise<PreloadedAds> } = {},
  ): Promise<void> {
    try {
      await this.run(schedule, options.resumeAt, options.preloaded);
    } catch {
      this.deps.onEvent?.('error:start');
      if (!this.disposed) {
        await this.playContent().catch(() => undefined);
      }
    }
  }

  private async run(
    schedule: AdSchedule,
    resumeAt: number | undefined,
    preloaded: Promise<PreloadedAds> | undefined,
  ): Promise<void> {
    const ready = resumeAt === undefined ? await this.usablePreload(schedule, preloaded) : null;
    if (ready?.preroll) {
      this.preloadedVast.set(ready.preroll.breakId, ready.preroll.results);
    }
    const breaks = ready ? ready.breaks : await this.resolve(schedule);
    if (this.disposed) {
      return;
    }
    breaks.forEach((b) => this.breaks.set(b.id, b));
    const scheduler = new BreakScheduler(breaks, { prefetchSeconds: this.deps.prefetchSeconds });
    this.scheduler = scheduler;
    const { content } = this.deps;
    this.offs.push(
      content.on('timeupdate', () => this.onContentTime()),
      content.on('ended', () => this.onContentEnded(scheduler)),
    );
    if (resumeAt !== undefined) {
      scheduler.resumeAt(resumeAt);
    }
    this.startPauseAds();
    this.reportTimeline(scheduler, null);
    const first = scheduler.begin();
    if (!first.some((d) => d.type === 'start')) {
      await this.playContent();
    }
    await this.apply(first);
  }

  /**
   * The viewer has seen something: the content, or at least one ad. Until then a restart
   * (for example after new surfaces) may begin from the start, with the pre-roll.
   */
  get viewingStarted(): boolean {
    return this.contentStarted || this.impressed;
  }

  /** Viewer pressed Skip. */
  skip(): boolean {
    return this.active?.skip() ?? false;
  }

  /** Play/pause of the ad on screen, for the app's own remote handler. */
  togglePause(): boolean {
    return this.active?.togglePause() ?? false;
  }

  /** Viewer pressed Back while a pause ad shows: it goes away. False when none was on screen. */
  closePauseAd(): boolean {
    return this.pauseAds?.close() ?? false;
  }

  /** Viewer pressed Back during an ad: back to the content (R23). */
  async back(): Promise<void> {
    if (this.active?.state === 'playing') {
      await this.active.cancel();
    }
  }

  /**
   * Releases every ad player and stops listening. Does not play the content; if an ad was
   * on screen, media controls go back to the content so the viewer can resume it.
   */
  async dispose(): Promise<void> {
    this.disposed = true;
    this.offs.splice(0).forEach((off) => off());
    this.pauseAds?.dispose();
    const wasPlaying = this.active?.state === 'playing';
    const sessions = [...this.prepared.values()].map((p) => p.session);
    this.prepared.clear();
    this.active = null;
    this.suspended = null;
    for (const session of sessions) {
      await session.interrupt();
    }
    if (wasPlaying) {
      await this.deps.content.takeMediaControlFocus().catch(() => undefined);
    }
  }

  /**
   * The app went to the background (R13; Amazon requires releasing media resources there):
   * releases every ad player. The content stays paused until wake().
   */
  async suspend(): Promise<void> {
    this.background = true;
    this.pauseAds?.hide();
    const active = this.active;
    const activeId = this.activeId;
    this.active = null;
    for (const [id, entry] of [...this.prepared]) {
      if (entry.session !== active) {
        this.prepared.delete(id);
        this.scheduler?.forget(id);
        void entry.loading.then(() => entry.session.interrupt());
      }
    }
    if (active && activeId) {
      await active.interrupt();
      this.suspended = { id: activeId, session: active };
    }
  }

  /** Back from the background: the interrupted break is not shown again; the content continues. */
  async wake(): Promise<void> {
    this.background = false;
    const cutOff = this.cutOff;
    this.cutOff = null;
    if (cutOff && !this.disposed) {
      this.deps.onEvent?.(`break:${cutOff}:interrupted`);
      await this.playContent();
      return;
    }
    const suspended = this.suspended;
    if (!suspended || this.disposed) {
      return;
    }
    this.suspended = null;
    this.prepared.delete(suspended.id);
    this.deps.onEvent?.(`break:${suspended.id}:interrupted`);
    this.contentStarted = true;
    await suspended.session.resumeContent();
    this.deps.onChange?.(IDLE_SNAPSHOT);
  }

  private startPauseAds(): void {
    const { pauseAdUrl, onPauseAd } = this.deps;
    if (!pauseAdUrl || !onPauseAd) {
      return;
    }
    this.pauseAds = new PauseAdController({
      http: this.deps.http,
      clock: this.deps.clock,
      content: this.deps.content,
      source: pauseAdUrl,
      macros: this.macros,
      delayMs: this.deps.pauseAdDelayMs,
      // Only a pause by the viewer: not while a break plays, not before or after the content
      // (a break waits for its ads only before the content started).
      canShow: () => this.contentStarted && !this.contentEnded && !this.active && !this.background,
      onChange: onPauseAd,
      onEvent: (name) => this.deps.onEvent?.(name),
    });
    this.pauseAds.start();
  }

  private async resolve(schedule: AdSchedule): Promise<ScheduledBreak[]> {
    const { breaks, errorCode } = await resolveSchedule(schedule, { http: this.deps.http, clock: this.deps.clock });
    if (errorCode !== undefined) {
      this.deps.onEvent?.(`vmap:error:${errorCode}`);
    }
    return breaks;
  }

  /** The preload, if it is for this schedule, fresh, and its VMAP request worked. */
  private async usablePreload(
    schedule: AdSchedule,
    preloaded: Promise<PreloadedAds> | undefined,
  ): Promise<{ breaks: ScheduledBreak[]; preroll: PreloadedAds['preroll'] } | null> {
    const ads = preloaded ? await preloaded.catch(() => null) : null;
    if (!ads?.breaks || ads.key !== scheduleKey(schedule) || this.deps.clock.now() - ads.at > PRELOAD_MAX_AGE_MS) {
      return null;
    }
    return { breaks: ads.breaks, preroll: ads.preroll };
  }

  private onContentEnded(scheduler: BreakScheduler): void {
    this.contentEnded = true;
    const decisions = scheduler.onEnded();
    if (!decisions.some((d) => d.type === 'start')) {
      this.deps.onEvent?.('content:ended');
    }
    void this.apply(decisions);
  }

  private isPostRoll(id: string): boolean {
    return this.breaks.get(id)?.offset.kind === 'end';
  }

  private onContentTime(): void {
    const scheduler = this.scheduler;
    if (!scheduler || this.disposed || this.active) {
      return;
    }
    const { content } = this.deps;
    if (!this.durationKnown && content.getDuration() > 0) {
      this.durationKnown = true;
      scheduler.setDuration(content.getDuration());
    }
    const time = content.getCurrentTime();
    const decisions = scheduler.onTime(time);
    const starting = new Set(decisions.filter((d) => d.type === 'start').map((d) => d.breakId));
    this.releasePassed(scheduler, starting);
    this.reportTimeline(scheduler, time);
    void this.apply(decisions);
  }

  private reportTimeline(scheduler: BreakScheduler, time: number | null): void {
    if (!this.deps.onTimeline) {
      return;
    }
    const limit = this.deps.countdownSeconds ?? 5;
    const next = time === null ? null : scheduler.nextIn(time);
    const ready = next !== null && this.prepared.get(next.breakId)?.ready === true;
    const nextBreakIn = ready && next.seconds > 0 && next.seconds <= limit ? Math.ceil(next.seconds) : null;
    const timeline: AdTimeline = { marks: scheduler.marks(), nextBreakIn };
    const key = JSON.stringify(timeline);
    if (key !== this.timeline) {
      this.timeline = key;
      this.deps.onTimeline(timeline);
    }
  }

  /** A prefetched break that a seek jumped over holds an ad player (a video decoder): free it. */
  private releasePassed(scheduler: BreakScheduler, starting: Set<string>): void {
    for (const [id, entry] of this.prepared) {
      if (scheduler.isDone(id) && !starting.has(id) && !this.starting.has(id) && entry.session !== this.active) {
        this.prepared.delete(id);
        void entry.loading.then(() => entry.session.interrupt());
      }
    }
  }

  private async apply(decisions: Decision[]): Promise<void> {
    for (const decision of decisions) {
      if (decision.type === 'prefetch') {
        this.prefetch(decision.breakId);
      } else {
        await this.startBreak(decision.breakId);
      }
    }
  }

  private prefetch(id: string): void {
    const adBreak = this.breaks.get(id);
    if (!adBreak || this.prepared.has(id) || this.disposed) {
      return;
    }
    const session: AdBreakSession = new AdBreakSession({
      http: this.deps.http,
      clock: this.deps.clock,
      content: this.deps.content,
      createAdPlayer: this.deps.createAdPlayer,
      adSurface: this.deps.adSurface,
      standbySurface: this.deps.standbySurface,
      macros: this.macros,
      mediaFile: this.deps.mediaFile,
      budgetMs: this.maxSeconds === undefined ? undefined : this.maxSeconds * 1000,
      maxAds: this.maxAds === undefined ? undefined : Math.floor(this.maxAds),
      repeats: this.repeats,
      onChange: (snapshot) => this.onSessionChange(id, session, snapshot),
      onEvent: (name) => {
        if (name === 'impression') {
          this.impressed = true;
        }
        this.deps.onEvent?.(name);
      },
    });
    const entry: Prepared = {
      session,
      loading: session.load(adBreak.sources.map((s) => s.source), this.takePreloaded(id)),
      loaded: false,
      ready: false,
    };
    void entry.loading.then((result) => {
      entry.loaded = true;
      entry.ready = result === 'ready';
    });
    this.prepared.set(id, entry);
  }

  private async startBreak(id: string): Promise<void> {
    const entry = this.prepared.get(id);
    if (!entry || this.active) {
      return;
    }
    if (!entry.loaded && this.contentStarted) {
      // Pausing the content to wait for a slow ad server is worse than losing the break.
      this.prepared.delete(id);
      this.deps.onEvent?.(`break:${id}:late`);
      void entry.loading.then(() => entry.session.interrupt());
      if (this.isPostRoll(id)) {
        this.deps.onEvent?.('content:ended');
      }
      return;
    }
    this.starting.add(id);
    const result = await entry.loading.finally(() => this.starting.delete(id));
    if (this.disposed) {
      return;
    }
    if (this.prepared.get(id) !== entry) {
      // suspend() released the break while it loaded.
      if (this.background) {
        this.cutOff = id;
      } else if (!this.contentStarted) {
        this.deps.onEvent?.(`break:${id}:interrupted`);
        await this.playContent();
      }
      return;
    }
    if (result !== 'ready') {
      this.prepared.delete(id);
      this.trackBreak(id, 'error', VMAP_EMPTY_RESPONSE);
      if (this.isPostRoll(id)) {
        this.deps.onEvent?.('content:ended');
      } else if (!this.contentStarted) {
        await this.playContent();
      }
      return;
    }
    this.active = entry.session;
    this.activeId = id;
    this.trackBreak(id, 'breakStart');
    await entry.session.start({ resumeContent: !this.isPostRoll(id) });
  }

  private onSessionChange(id: string, session: AdBreakSession, snapshot: SessionSnapshot): void {
    if (session !== this.active) {
      return;
    }
    if (snapshot.state === 'finished') {
      this.trackBreak(id, 'breakEnd');
      this.active = null;
      this.contentStarted = true;
      this.prepared.delete(id);
      this.deps.onChange?.(IDLE_SNAPSHOT);
      if (this.isPostRoll(id)) {
        this.deps.onEvent?.('content:ended');
      }
      return;
    }
    this.deps.onChange?.(snapshot);
  }

  /** VAST answers preloaded for a break, once. */
  private takePreloaded(id: string): VastResult[] {
    const results = this.preloadedVast.get(id) ?? [];
    this.preloadedVast.delete(id);
    return results;
  }

  /** VMAP tracking of the break (manual schedules have no pixels). */
  private trackBreak(id: string, event: VmapTrackingEvent, errorCode?: number): void {
    this.breaks.get(id)?.sources.forEach((source) => source.track(event, errorCode));
  }

  private async playContent(): Promise<void> {
    this.contentStarted = true;
    await this.deps.content.play();
    await this.deps.content.takeMediaControlFocus();
  }
}
