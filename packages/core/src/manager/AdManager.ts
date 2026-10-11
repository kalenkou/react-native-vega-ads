import { ClockPort, HttpPort, Macros, MediaFileOptions, requestVmap, ScheduledBreak } from '@vega-ads/vast';
import { AdBreakSession, SessionSnapshot } from '../machine/AdBreakSession';
import { BreakScheduler, Decision } from '../schedule/BreakScheduler';
import type { PlayerPort } from '../ports';

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

interface Prepared {
  session: AdBreakSession;
  loading: Promise<'ready' | 'empty'>;
  loaded: boolean;
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
  private active: AdBreakSession | null = null;
  private activeId: string | null = null;
  /** A break interrupted by the app going to the background. */
  private suspended: { id: string; session: AdBreakSession } | null = null;
  private contentStarted = false;
  private disposed = false;
  private durationKnown = false;
  private readonly offs: Array<() => void> = [];

  constructor(deps: AdManagerDeps) {
    this.deps = deps;
  }

  /**
   * Reads the schedule, plays the pre-roll if there is one, otherwise starts the content.
   * `resumeAt` continues a viewing that was interrupted: no pre-roll, no earlier breaks.
   * Never rejects: on failure the content plays and `error:start` is reported.
   */
  async start(schedule: AdSchedule, options: { resumeAt?: number } = {}): Promise<void> {
    try {
      await this.run(schedule, options.resumeAt);
    } catch {
      this.deps.onEvent?.('error:start');
      if (!this.disposed) {
        await this.playContent().catch(() => undefined);
      }
    }
  }

  private async run(schedule: AdSchedule, resumeAt: number | undefined): Promise<void> {
    const breaks = await this.resolve(schedule);
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
    const first = scheduler.begin();
    if (!first.some((d) => d.type === 'start')) {
      await this.playContent();
    }
    await this.apply(first);
  }

  /** Viewer pressed Skip. */
  skip(): boolean {
    return this.active?.skip() ?? false;
  }

  /** Play/pause of the ad on screen, for the app's own remote handler. */
  togglePause(): boolean {
    return this.active?.togglePause() ?? false;
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

  private async resolve(schedule: AdSchedule): Promise<ScheduledBreak[]> {
    if ('breaks' in schedule) {
      return schedule.breaks.map((b, i) => ({
        id: `break-${i + 1}`,
        offset: b.offset === 'start' || b.offset === 'end' ? { kind: b.offset } : { kind: 'time', seconds: b.offset },
        sources: [{ id: null, source: { kind: 'url', url: b.vastUrl }, allowMultipleAds: true, track: () => undefined }],
      }));
    }
    const vmap = await requestVmap(schedule.vmapUrl, { http: this.deps.http, clock: this.deps.clock });
    if (vmap.status === 'failed') {
      this.deps.onEvent?.(`vmap:error:${vmap.errorCode}`);
    }
    if (vmap.status !== 'ok') {
      return [];
    }
    return vmap.breaks;
  }

  private onContentEnded(scheduler: BreakScheduler): void {
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
    const decisions = scheduler.onTime(content.getCurrentTime());
    const starting = new Set(decisions.filter((d) => d.type === 'start').map((d) => d.breakId));
    this.releasePassed(scheduler, starting);
    void this.apply(decisions);
  }

  /** A prefetched break that a seek jumped over holds an ad player (a video decoder): free it. */
  private releasePassed(scheduler: BreakScheduler, starting: Set<string>): void {
    for (const [id, entry] of this.prepared) {
      if (scheduler.isDone(id) && !starting.has(id) && entry.session !== this.active) {
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
      macros: this.deps.macros,
      mediaFile: this.deps.mediaFile,
      onChange: (snapshot) => this.onSessionChange(id, session, snapshot),
      onEvent: this.deps.onEvent,
    });
    const entry: Prepared = { session, loading: session.load(adBreak.sources.map((s) => s.source)), loaded: false };
    void entry.loading.then(() => (entry.loaded = true));
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
    const result = await entry.loading;
    if (this.disposed) {
      return;
    }
    if (result !== 'ready') {
      this.prepared.delete(id);
      if (this.isPostRoll(id)) {
        this.deps.onEvent?.('content:ended');
      } else if (!this.contentStarted) {
        await this.playContent();
      }
      return;
    }
    this.active = entry.session;
    this.activeId = id;
    await entry.session.start({ resumeContent: !this.isPostRoll(id) });
  }

  private onSessionChange(id: string, session: AdBreakSession, snapshot: SessionSnapshot): void {
    if (session !== this.active) {
      return;
    }
    if (snapshot.state === 'finished') {
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

  private async playContent(): Promise<void> {
    this.contentStarted = true;
    await this.deps.content.play();
    await this.deps.content.takeMediaControlFocus();
  }
}
