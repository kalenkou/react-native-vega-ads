import type { PlayerEventName, PlayerPort } from 'react-native-ads-core';

/** The part of HTMLVideoElement the port uses, so the tests need no browser. */
export interface VideoElement {
  autoplay: boolean;
  muted: boolean;
  volume: number;
  src: string;
  currentTime: number;
  readonly duration: number;
  readonly parentElement: { id: string } | null;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  remove(): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** Finds a surface (an element of the page) by its handle, the element id. */
export type FindSurface = (id: string) => { appendChild(video: VideoElement): unknown } | null;

/**
 * PlayerPort on an HTML video element: the browser stand-in for the w3cmedia VideoPlayer.
 * With `findSurface` the port is an ad player: attachSurface() puts the element into the
 * surface element and deinitialize() takes it out. Without it the element stays where the
 * page put it (the content player).
 */
export class HtmlVideoPort implements PlayerPort {
  private readonly offs = new Set<() => void>();

  /**
   * @param onSoundBlocked called when the browser allowed the video only without sound
   */
  constructor(
    private readonly video: VideoElement,
    private readonly findSurface?: FindSurface,
    private readonly onSoundBlocked?: () => void,
  ) {}

  initialize(): Promise<void> {
    return Promise.resolve();
  }

  attachSurface(handle: string): void {
    this.findSurface?.(handle)?.appendChild(this.video);
  }

  detachSurface(handle: string): void {
    if (this.findSurface && this.video.parentElement?.id === handle) {
      this.video.remove();
    }
  }

  setAutoplay(autoplay: boolean): void {
    this.video.autoplay = autoplay;
  }

  setSrc(url: string): void {
    this.video.src = url;
  }

  setMuted(muted: boolean): void {
    this.video.muted = muted;
  }

  setVolume(volume: number): void {
    this.video.volume = volume;
  }

  /** Browsers may refuse sound before the viewer has used the page: then the video plays muted. */
  async play(): Promise<void> {
    try {
      await this.video.play();
    } catch (error) {
      if ((error as { name?: string }).name !== 'NotAllowedError' || this.video.muted) {
        throw error;
      }
      this.video.muted = true;
      this.onSoundBlocked?.();
      await this.video.play();
    }
  }

  pause(): void {
    this.video.pause();
  }

  getCurrentTime(): number {
    return this.video.currentTime;
  }

  setCurrentTime(seconds: number): void {
    this.video.currentTime = seconds;
  }

  getDuration(): number {
    const duration = this.video.duration;
    return Number.isFinite(duration) ? duration : 0;
  }

  /** A web page has no media controls focus: the page's own buttons and keys control both players. */
  takeMediaControlFocus(): Promise<void> {
    return Promise.resolve();
  }

  on(event: PlayerEventName, listener: () => void): () => void {
    const handler = (): void => listener();
    this.video.addEventListener(event, handler);
    const off = (): void => {
      this.video.removeEventListener(event, handler);
      this.offs.delete(off);
    };
    this.offs.add(off);
    return off;
  }

  async deinitialize(): Promise<void> {
    [...this.offs].forEach((off) => off());
    this.video.pause();
    if (this.findSurface) {
      // Stops the download, as the HTML spec advises for a media element that is no longer needed.
      this.video.removeAttribute('src');
      this.video.load();
      this.video.remove();
    }
  }
}
