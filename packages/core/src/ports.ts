/**
 * Ports: everything the core needs from the platform.
 * The core never imports a player SDK, fetch or timers directly.
 */

export type PlayerEventName = 'canplay' | 'playing' | 'pause' | 'waiting' | 'timeupdate' | 'ended' | 'error';

export interface PlayerPort {
  /** Must resolve before any other call (w3cmedia rule). */
  initialize(): Promise<void>;
  attachSurface(handle: string): void;
  /** Works only with the same handle that was attached; other handles are ignored. */
  detachSurface(handle: string): void;
  setAutoplay(autoplay: boolean): void;
  setSrc(url: string): void;
  /** Silences the player without pausing it. */
  setMuted(muted: boolean): void;
  /** Resolves as soon as the command is accepted, not when frames are shown. */
  play(): Promise<void>;
  pause(): void;
  getCurrentTime(): number;
  setCurrentTime(seconds: number): void;
  getDuration(): number;
  /** Human-readable reason of the last error, if the platform gives one. */
  getErrorMessage(): string | undefined;
  /** Give remote and voice play/pause to this player. */
  takeMediaControlFocus(): Promise<void>;
  on(event: PlayerEventName, listener: () => void): () => void;
  deinitialize(): Promise<void>;
}

export type { ClockPort, HttpPort, HttpRequestOptions, HttpResponse, LoggerPort } from './vast';
export { silentLogger } from './vast';
