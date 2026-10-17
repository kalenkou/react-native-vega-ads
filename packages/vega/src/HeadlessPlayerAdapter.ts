import type { PlayerEventName, PlayerPort } from 'react-native-ads-core';

/** IPlayerSessionId from @amazon-devices/kepler-player-server. */
export interface HeadlessSessionId {
  id: number;
}

/** The fields of IPlayerSessionStatus that the adapter reads. */
export interface HeadlessSessionStatus {
  readonly sessionId?: HeadlessSessionId;
  /** IPlayerSessionState: PAUSED, PLAYING, BUFFERING, SEEKING, ENDED, ERROR, READY. */
  readonly playbackState: string;
  readonly duration?: number;
}

interface Subscription {
  unsubscribe(): void;
}

/** The listener shapes of @amazon-devices/kepler-player-client, by their SDK names. */
export interface HeadlessStatusListener {
  onSessionStatusChanged(updatedStatus: HeadlessSessionStatus[]): void;
}
export interface HeadlessPositionListener {
  onPositionUpdated(updatedPosition: Array<{ sessionId?: HeadlessSessionId; position: number }>): void;
}
export interface HeadlessErrorListener {
  onError(error: { code: number; message: string }, sessionId?: HeadlessSessionId): void;
}

/**
 * The part of `IPlayerClient` from @amazon-devices/kepler-player-client that the adapter uses.
 * Declared here so the package does not ship or import the SDK.
 */
export interface HeadlessPlayerClient {
  load(
    mediaInfo: { mediaUrl: { url: string } },
    loadParams?: { startPosition: number; autoPlay: boolean },
    sessionId?: HeadlessSessionId,
  ): Promise<void>;
  unload(sessionId?: HeadlessSessionId): Promise<void>;
  setVideoView(viewHandle: { handle: string }, sessionId?: HeadlessSessionId): Promise<void>;
  clearVideoView(sessionId?: HeadlessSessionId): Promise<void>;
  play(sessionId?: HeadlessSessionId): Promise<void>;
  pause(sessionId?: HeadlessSessionId): Promise<void>;
  seek(position: number, isRelative?: boolean, sessionId?: HeadlessSessionId): Promise<void>;
  setMute(isMuted: boolean, sessionId?: HeadlessSessionId): Promise<void>;
  setVolume(volume: number, sessionId?: HeadlessSessionId): Promise<void>;
  // `never`: accepts the SDK's own parameter types without importing the SDK.
  setMediaControlFocus(componentInstance: never, mediaControlHandler?: never): Promise<void>;
  registerStatusListener(listener: HeadlessStatusListener, sessionId?: HeadlessSessionId): Promise<Subscription>;
  registerPositionListener(
    listener: HeadlessPositionListener,
    interval: number,
    sessionId?: HeadlessSessionId,
  ): Promise<Subscription>;
  registerErrorListener(listener: HeadlessErrorListener, sessionId?: HeadlessSessionId): Promise<Subscription>;
}

/**
 * How often the service reports the position, in SECONDS (the SDK unit; its example uses 1).
 * Fractions work on the device (0.25 gives 4 updates a second), which the break start and the
 * quartiles need: a break starts on the update after its time.
 */
const POSITION_INTERVAL_SECONDS = 0.25;

/** Session state → the event the core waits for. SEEKING has none: the core does not wait for it. */
const EVENT_OF_STATE: Record<string, PlayerEventName | undefined> = {
  READY: 'canplay',
  PLAYING: 'playing',
  PAUSED: 'pause',
  BUFFERING: 'waiting',
  ENDED: 'ended',
  ERROR: 'error',
};

export interface HeadlessPlayerOptions {
  /** false: never take media controls focus (the app handles the remote keys). */
  mediaControls?: boolean;
}

/**
 * PlayerPort on one session of a headless player service (Amazon's CSAI "Headless approach"):
 * the w3cmedia player runs in the app's service process, this side talks to it through
 * `IPlayerClient`. Commands are asynchronous IPC calls; the time and duration come from the
 * service's position and status listeners.
 *
 * For the content, the app owns the adapter: it calls `initialize()` and `setSrc()` itself,
 * as with any content PlayerPort. Ad sessions are created and released by the library
 * (`createAdPlayer`).
 */
export class HeadlessPlayerAdapter implements PlayerPort {
  private readonly listeners = new Map<PlayerEventName, Set<() => void>>();
  private subscriptions: Subscription[] = [];
  private autoplay = true;
  private state: string | undefined;
  private time = 0;
  private duration = 0;
  private surface: string | null = null;

  /**
   * @param client an `IPlayerClient` from `new PlayerClientFactory().getOrMakeClient(serviceComponentId)`
   * @param session this player's session in the service; each player needs its own
   * @param componentInstance returns the app's IComponentInstance, needed for media controls
   */
  constructor(
    private readonly client: HeadlessPlayerClient,
    private readonly session: HeadlessSessionId,
    private readonly componentInstance: () => unknown,
    private readonly options: HeadlessPlayerOptions = {},
  ) {}

  async initialize(): Promise<void> {
    const mine = (id?: HeadlessSessionId): boolean => id === undefined || id.id === this.session.id;
    this.subscriptions = await Promise.all([
      this.client.registerStatusListener(
        {
          onSessionStatusChanged: (update) => {
            const status = update.find((s) => mine(s.sessionId));
            if (status) this.onStatus(status);
          },
        },
        this.session,
      ),
      this.client.registerPositionListener(
        {
          onPositionUpdated: (update) => {
            const position = update.find((p) => mine(p.sessionId));
            if (position) {
              this.time = position.position;
              this.emit('timeupdate');
            }
          },
        },
        POSITION_INTERVAL_SECONDS,
        this.session,
      ),
      this.client.registerErrorListener(
        {
          onError: (_error, sessionId) => {
            if (mine(sessionId)) this.emit('error');
          },
        },
        this.session,
      ),
    ]);
  }

  private onStatus(status: HeadlessSessionStatus): void {
    if (status.duration !== undefined && Number.isFinite(status.duration)) this.duration = status.duration;
    if (status.playbackState === this.state) return;
    this.state = status.playbackState;
    const event = EVENT_OF_STATE[status.playbackState];
    if (event) this.emit(event);
  }

  private emit(event: PlayerEventName): void {
    [...(this.listeners.get(event) ?? [])].forEach((listener) => listener());
  }

  /** A command the service refused: the core hears it as a player error. */
  private send(command: Promise<void>): void {
    command.catch(() => this.emit('error'));
  }

  attachSurface(handle: string): void {
    this.surface = handle;
    this.send(this.client.setVideoView({ handle }, this.session));
  }

  detachSurface(handle: string): void {
    if (this.surface !== handle) return;
    this.surface = null;
    this.send(this.client.clearVideoView(this.session));
  }

  setAutoplay(autoplay: boolean): void {
    this.autoplay = autoplay;
  }

  setSrc(url: string): void {
    this.state = undefined;
    this.time = 0;
    this.send(this.client.load({ mediaUrl: { url } }, { startPosition: 0, autoPlay: this.autoplay }, this.session));
  }

  setMuted(muted: boolean): void {
    this.send(this.client.setMute(muted, this.session));
  }

  setVolume(volume: number): void {
    this.send(this.client.setVolume(volume, this.session));
  }

  play(): Promise<void> {
    return this.client.play(this.session);
  }

  pause(): void {
    this.send(this.client.pause(this.session));
  }

  getCurrentTime(): number {
    return this.time;
  }

  setCurrentTime(seconds: number): void {
    // The next position update confirms it; until then the target is the best answer.
    this.time = seconds;
    this.send(this.client.seek(seconds, false, this.session));
  }

  getDuration(): number {
    return this.duration;
  }

  async takeMediaControlFocus(): Promise<void> {
    if (this.options.mediaControls === false) return;
    return this.client.setMediaControlFocus(this.componentInstance() as never);
  }

  on(event: PlayerEventName, listener: () => void): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
    return () => set.delete(listener);
  }

  async deinitialize(): Promise<void> {
    this.subscriptions.forEach((s) => s.unsubscribe());
    this.subscriptions = [];
    this.listeners.clear();
    await this.client.unload(this.session).catch(() => undefined);
  }
}
