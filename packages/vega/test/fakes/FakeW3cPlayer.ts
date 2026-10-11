import type { W3cVideoPlayer } from '../../src/W3cPlayerAdapter';

/** A w3cmedia VideoPlayer double: records calls, emits events on demand. */
export class FakeW3cPlayer implements W3cVideoPlayer {
  readonly calls: string[] = [];
  autoplay = true;
  muted = false;
  src = '';
  currentTime = 0;
  duration: number;
  error: { code: number; message?: string } | null = null;
  deinitialized = false;
  private listeners = new Map<string, Set<() => void>>();

  constructor(duration = 10) {
    this.duration = duration;
  }

  async initialize(): Promise<void> {
    this.calls.push('initialize');
  }
  setSurfaceHandle(handle: string): void {
    this.calls.push(`surface:${handle}`);
  }
  clearSurfaceHandle(handle: string): void {
    this.calls.push(`clear:${handle}`);
  }
  async play(): Promise<void> {
    this.calls.push('play');
  }
  pause(): void {
    this.calls.push('pause');
  }
  async setMediaControlFocus(): Promise<void> {
    this.calls.push('focus');
  }
  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  async deinitialize(): Promise<void> {
    this.calls.push('deinitialize');
    this.deinitialized = true;
  }
  emit(type: string): void {
    [...(this.listeners.get(type) ?? [])].forEach((listener) => listener());
  }
  listenerTypes(): string[] {
    return [...this.listeners.entries()].flatMap(([type, set]) => [...set].map(() => type));
  }
  listenerCount(): number {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }
}
