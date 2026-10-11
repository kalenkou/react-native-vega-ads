import type { PlayerEventName, PlayerPort } from '@vega-ads/core';

/**
 * The part of `VideoPlayer` from @amazon-devices/react-native-w3cmedia that the
 * adapter uses. Declared here so the package does not ship or import the SDK.
 */
export interface W3cVideoPlayer {
  autoplay: boolean;
  muted: boolean;
  src: string;
  currentTime: number;
  readonly duration: number;
  readonly error: { code: number; message?: string } | null | undefined;
  initialize(): Promise<void>;
  setSurfaceHandle(handle: string): void;
  clearSurfaceHandle(handle: string): void;
  play(): Promise<void>;
  pause(): void;
  setMediaControlFocus(componentInstance: never, mediaControlHandler?: never): Promise<void>;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  deinitialize(): Promise<void>;
}

/** PlayerPort on top of a w3cmedia VideoPlayer. */
export class W3cPlayerAdapter implements PlayerPort {
  private readonly subscriptions = new Set<() => void>();

  /**
   * @param player a `new VideoPlayer()` from @amazon-devices/react-native-w3cmedia
   * @param componentInstance returns the app's IComponentInstance, needed for media controls
   * @param mediaControlHandler returns the media controls handler to use; none means the SDK default
   * @param mediaControls false: never take media controls focus (the app handles the remote keys)
   */
  constructor(
    private readonly player: W3cVideoPlayer,
    private readonly componentInstance: () => unknown,
    private readonly mediaControlHandler: () => unknown = () => undefined,
    private readonly mediaControls = true,
  ) {}

  initialize(): Promise<void> {
    return this.player.initialize();
  }

  attachSurface(handle: string): void {
    this.player.setSurfaceHandle(handle);
  }

  detachSurface(handle: string): void {
    this.player.clearSurfaceHandle(handle);
  }

  setAutoplay(autoplay: boolean): void {
    this.player.autoplay = autoplay;
  }

  setSrc(url: string): void {
    this.player.src = url;
  }

  setMuted(muted: boolean): void {
    this.player.muted = muted;
  }

  play(): Promise<void> {
    return this.player.play();
  }

  pause(): void {
    this.player.pause();
  }

  getCurrentTime(): number {
    return this.player.currentTime;
  }

  setCurrentTime(seconds: number): void {
    this.player.currentTime = seconds;
  }

  getDuration(): number {
    const duration = this.player.duration;
    return Number.isFinite(duration) ? duration : 0;
  }

  getErrorMessage(): string | undefined {
    const error = this.player.error;
    if (!error) {
      return undefined;
    }
    return error.message ? `MediaError ${error.code}: ${error.message}` : `MediaError ${error.code}`;
  }

  takeMediaControlFocus(): Promise<void> {
    if (!this.mediaControls) {
      return Promise.resolve();
    }
    const handler = this.mediaControlHandler();
    return handler === undefined
      ? this.player.setMediaControlFocus(this.componentInstance() as never)
      : this.player.setMediaControlFocus(this.componentInstance() as never, handler as never);
  }

  on(event: PlayerEventName, listener: () => void): () => void {
    const handler = (): void => listener();
    this.player.addEventListener(event, handler);
    const off = (): void => {
      this.player.removeEventListener(event, handler);
      this.subscriptions.delete(off);
    };
    this.subscriptions.add(off);
    return off;
  }

  async deinitialize(): Promise<void> {
    [...this.subscriptions].forEach((off) => off());
    await this.player.deinitialize();
  }
}
