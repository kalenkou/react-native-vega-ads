import type { PlayerEventName, PlayerPort } from '../../src/ports';

/**
 * Test double that copies the w3cmedia rules the core depends on:
 * calls before initialize() fail, play() resolves at once and `playing`
 * comes later, detachSurface() with another handle does nothing.
 */
export class FakePlayer implements PlayerPort {
  surface: string | null = null;
  src: string | null = null;
  autoplay = true;
  muted = false;
  paused = true;
  deinitialized = false;
  hasMediaControlFocus = false;
  readonly calls: string[] = [];

  private initialized = false;
  private time = 0;
  private readonly duration: number;
  private errorMessage: string | undefined;
  private listeners = new Map<PlayerEventName, Set<() => void>>();
  private queue: PlayerEventName[] = [];

  constructor(options: { duration?: number } = {}) {
    this.duration = options.duration ?? 0;
  }

  async initialize(): Promise<void> {
    this.calls.push('initialize');
    this.initialized = true;
  }

  attachSurface(handle: string): void {
    this.assertReady();
    this.surface = handle;
  }

  detachSurface(handle: string): void {
    if (this.surface === handle) {
      this.surface = null;
    }
  }

  setAutoplay(autoplay: boolean): void {
    this.assertReady();
    this.autoplay = autoplay;
  }

  setSrc(url: string): void {
    this.assertReady();
    this.calls.push(`src:${url}`);
    this.src = url;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  async play(): Promise<void> {
    this.assertReady();
    this.calls.push('play');
    this.paused = false;
    this.queue.push('playing');
  }

  pause(): void {
    this.assertReady();
    this.calls.push('pause');
    this.paused = true;
    this.queue.push('pause');
  }

  getCurrentTime(): number {
    return this.time;
  }

  setCurrentTime(seconds: number): void {
    this.calls.push(`seek:${seconds}`);
    this.time = seconds;
  }

  getDuration(): number {
    return this.duration;
  }

  getErrorMessage(): string | undefined {
    return this.errorMessage;
  }

  async takeMediaControlFocus(): Promise<void> {
    this.calls.push('focus');
    this.hasMediaControlFocus = true;
  }

  on(event: PlayerEventName, listener: () => void): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
    return () => set.delete(listener);
  }

  async deinitialize(): Promise<void> {
    this.calls.push('deinitialize');
    this.deinitialized = true;
    this.initialized = false;
    this.listeners.clear();
    this.queue = [];
  }

  /** Delivers events queued by play()/pause(), like the native side does later. */
  async flush(): Promise<void> {
    await Promise.resolve();
    const events = this.queue;
    this.queue = [];
    events.forEach((event) => this.emit(event));
  }

  emitCanPlay(): void {
    this.emit('canplay');
  }

  emitTime(seconds: number): void {
    this.time = seconds;
    this.emit('timeupdate');
  }

  /** A pause done by the platform (media controls, voice), not through pause(). */
  emitPause(): void {
    this.paused = true;
    this.emit('pause');
  }

  /** The player ran out of data and is buffering. */
  emitWaiting(): void {
    this.emit('waiting');
  }

  emitEnded(): void {
    this.emit('ended');
  }

  emitError(message: string): void {
    this.errorMessage = message;
    this.emit('error');
  }

  private emit(event: PlayerEventName): void {
    if (this.deinitialized) {
      return;
    }
    [...(this.listeners.get(event) ?? [])].forEach((listener) => listener());
  }

  private assertReady(): void {
    if (!this.initialized) {
      throw new Error('player not initialized');
    }
  }
}
