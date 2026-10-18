import type { HeadlessSessionId } from './HeadlessPlayerAdapter';
import type { W3cVideoPlayer } from './W3cPlayerAdapter';

/** The w3cmedia headless `VideoPlayer` (`@amazon-devices/react-native-w3cmedia/dist/headless`) as the service uses it. */
export interface HeadlessServicePlayer extends W3cVideoPlayer {
  playbackRate: number;
  readonly error?: { code: number; message?: string } | null;
}

/** The part of `IPlayerServer` from @amazon-devices/kepler-player-server that the service uses. */
export interface HeadlessPlayerServer {
  updateStatus(
    status: Array<{
      sessionId?: HeadlessSessionId;
      playbackState: string;
      playbackRate: number;
      isMuted: boolean;
      volume: number;
      seekable: boolean;
      duration?: number;
    }>,
  ): Promise<void>;
  sendError(error: { code: number; message: string }, sessionId?: HeadlessSessionId): Promise<void>;
}

/** w3cmedia event → IPlayerSessionState. */
const STATE_OF_EVENT: Record<string, string> = {
  canplay: 'READY',
  playing: 'PLAYING',
  pause: 'PAUSED',
  waiting: 'BUFFERING',
  seeking: 'SEEKING',
  ended: 'ENDED',
  error: 'ERROR',
};

interface Session {
  readonly player: HeadlessServicePlayer;
  /** Resolves when the player is initialized; commands wait for it, in order. */
  queue: Promise<void>;
  listeners: Array<[string, () => void]>;
  surface: string | null;
  initialized: boolean;
  released: boolean;
}

/**
 * The service side of Amazon's CSAI "Headless approach": an `IPlayerServerHandler` that plays
 * each client session on its own w3cmedia player, so content and ads can each have a session.
 * In the app's service component:
 *
 *   const server = new PlayerServerFactory().getOrMakeServer();
 *   server.setHandler(new HeadlessPlayerService(server, () => new VideoPlayer()), '<app>.service');
 */
export class HeadlessPlayerService {
  private readonly sessions = new Map<number, Session>();
  private readonly statusUpdates = new Set<number>();
  private readonly errorUpdates = new Set<number>();
  /** Settings for a session that has no player yet: applied when the load or the view starts it. */
  private readonly pending = new Map<number, Array<(player: HeadlessServicePlayer) => void>>();

  constructor(
    private readonly server: HeadlessPlayerServer,
    private readonly createPlayer: () => HeadlessServicePlayer,
  ) {}

  private key(sessionId?: HeadlessSessionId): number {
    return sessionId?.id ?? 0;
  }

  /**
   * Runs once the session's player is initialized. `open`: the load and the view start the
   * session (the core sets the view before the load); other commands for an unknown session do
   * nothing.
   */
  private run(
    sessionId: HeadlessSessionId | undefined,
    command: (player: HeadlessServicePlayer, session: Session) => void,
    open = false,
  ): void {
    const session = open ? this.open(sessionId) : this.sessions.get(this.key(sessionId));
    if (!session) return;
    session.queue = session.queue.then(() => {
      if (!session.released) command(session.player, session);
    });
  }

  private open(sessionId?: HeadlessSessionId): Session {
    const id = this.key(sessionId);
    const existing = this.sessions.get(id);
    if (existing) return existing;
    const player = this.createPlayer();
    const session: Session = {
      player,
      queue: Promise.resolve(),
      listeners: [],
      surface: null,
      initialized: false,
      released: false,
    };
    session.listeners = Object.keys(STATE_OF_EVENT).map((event) => [
      event,
      () => this.report(id, sessionId, session, event),
    ]);
    const settings = this.pending.get(id) ?? [];
    this.pending.delete(id);
    session.queue = player.initialize().then(() => {
      if (session.released) return;
      session.initialized = true;
      session.listeners.forEach(([event, listener]) => player.addEventListener(event, listener));
      settings.forEach((apply) => apply(player));
    });
    session.queue.catch(() => undefined);
    this.sessions.set(id, session);
    return session;
  }

  private report(id: number, sessionId: HeadlessSessionId | undefined, session: Session, event: string): void {
    const { player } = session;
    if (this.statusUpdates.has(id)) {
      const duration = Number.isFinite(player.duration) ? player.duration : undefined;
      void this.server
        .updateStatus([
          {
            sessionId,
            playbackState: STATE_OF_EVENT[event]!,
            playbackRate: player.playbackRate,
            isMuted: player.muted,
            volume: player.volume,
            seekable: true,
            duration,
          },
        ])
        .catch(() => undefined);
    }
    if (event === 'error' && this.errorUpdates.has(id)) {
      const error = player.error ?? { code: 0 };
      void this.server.sendError({ code: error.code, message: error.message ?? '' }, sessionId).catch(() => undefined);
    }
  }

  handleLoad(
    mediaInfo: { mediaUrl: { url: string } },
    loadParams?: { startPosition: number; autoPlay: boolean },
    sessionId?: HeadlessSessionId,
  ): void {
    this.run(
      sessionId,
      (player) => {
        player.autoplay = loadParams?.autoPlay ?? true;
        player.src = mediaInfo.mediaUrl.url;
        if (loadParams && loadParams.startPosition > 0) player.currentTime = loadParams.startPosition;
      },
      true,
    );
  }

  /** Amazon's order: clear the surface, then deinitialize. */
  handleUnload(sessionId?: HeadlessSessionId): void {
    const id = this.key(sessionId);
    this.pending.delete(id);
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    // Not initialized yet: nothing reached w3cmedia, so the queued commands are dropped.
    if (!session.initialized) session.released = true;
    const { player } = session;
    session.queue.then(
      () => {
        session.released = true;
        session.listeners.forEach(([event, listener]) => player.removeEventListener(event, listener));
        if (session.surface !== null) player.clearSurfaceHandle(session.surface);
        player.pause();
        void player.deinitialize().catch(() => undefined);
      },
      () => undefined,
    );
  }

  handleSetVideoView(view: { handle: string }, sessionId?: HeadlessSessionId): void {
    this.run(
      sessionId,
      (player, session) => {
        session.surface = view.handle;
        player.setSurfaceHandle(view.handle);
      },
      true,
    );
  }

  handleClearVideoView(sessionId?: HeadlessSessionId): void {
    this.run(sessionId, (player, session) => {
      if (session.surface === null) return;
      player.clearSurfaceHandle(session.surface);
      session.surface = null;
    });
  }

  handlePlay(sessionId?: HeadlessSessionId): void {
    this.run(sessionId, (player) => void player.play().catch(() => undefined));
  }

  handlePause(sessionId?: HeadlessSessionId): void {
    this.run(sessionId, (player) => player.pause());
  }

  handleSeek(position: number, isRelative?: boolean, sessionId?: HeadlessSessionId): void {
    this.run(sessionId, (player) => {
      player.currentTime = isRelative ? player.currentTime + position : position;
    });
  }

  /**
   * Volume, mute and rate may come before the load (the core sets the volume first). They wait
   * for the session instead of starting a player: a call without a known session (for example
   * from the SDK's own media controls) must not leave a stray decoder behind.
   */
  private setting(sessionId: HeadlessSessionId | undefined, apply: (player: HeadlessServicePlayer) => void): void {
    const id = this.key(sessionId);
    if (this.sessions.has(id)) {
      this.run(sessionId, (player) => apply(player));
      return;
    }
    this.pending.set(id, [...(this.pending.get(id) ?? []), apply]);
  }

  handleSetMute(isMuted: boolean, sessionId?: HeadlessSessionId): void {
    this.setting(sessionId, (player) => {
      player.muted = isMuted;
    });
  }

  handleSetVolume(volume: number, sessionId?: HeadlessSessionId): void {
    this.setting(sessionId, (player) => {
      player.volume = volume;
    });
  }

  handleSetPlaybackRate(playbackRate: number, sessionId?: HeadlessSessionId): void {
    this.setting(sessionId, (player) => {
      player.playbackRate = playbackRate;
    });
  }

  handleGetCurrentPosition(sessionId?: HeadlessSessionId): number {
    const session = this.sessions.get(this.key(sessionId));
    return session ? session.player.currentTime : 0;
  }

  handleStartStatusUpdates(sessionId?: HeadlessSessionId): void {
    this.statusUpdates.add(this.key(sessionId));
  }

  handleStopStatusUpdates(sessionId?: HeadlessSessionId): void {
    this.statusUpdates.delete(this.key(sessionId));
  }

  handleStartErrorUpdates(sessionId?: HeadlessSessionId): void {
    this.errorUpdates.add(this.key(sessionId));
  }

  handleStopErrorUpdates(sessionId?: HeadlessSessionId): void {
    this.errorUpdates.delete(this.key(sessionId));
  }

  // Not used by ads: text views, tracks, messages and buffered ranges.
  handleSetTextView(): void {}
  handleClearTextView(): void {}
  handleSetActiveTrack(): void {}
  handleMessage(): void {}
  handleStartBufferedRangesUpdates(): void {}
  handleStopBufferedRangesUpdates(): void {}
  handleStartTrackUpdates(): void {}
  handleStopTrackUpdates(): void {}
  handleStartMessageUpdates(): void {}
  handleStopMessageUpdates(): void {}
}
