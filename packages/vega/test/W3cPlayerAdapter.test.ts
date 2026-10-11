import { W3cPlayerAdapter, W3cVideoPlayer } from '../src/W3cPlayerAdapter';

/** Records how the adapter drives a w3cmedia VideoPlayer. */
class RecordingPlayer implements W3cVideoPlayer {
  calls: string[] = [];
  autoplay = true;
  muted = false;
  src = '';
  currentTime = 0;
  duration = NaN;
  error: { code: number; message?: string } | null = null;
  listeners = new Map<string, Set<(event?: unknown) => void>>();

  async initialize(): Promise<void> {
    this.calls.push('initialize');
  }
  setSurfaceHandle(handle: string): void {
    this.calls.push(`setSurfaceHandle:${handle}`);
  }
  clearSurfaceHandle(handle: string): void {
    this.calls.push(`clearSurfaceHandle:${handle}`);
  }
  async play(): Promise<void> {
    this.calls.push('play');
  }
  pause(): void {
    this.calls.push('pause');
  }
  async setMediaControlFocus(instance: unknown): Promise<void> {
    this.calls.push(`focus:${String((instance as { name: string }).name)}`);
  }
  addEventListener(type: string, listener: (event?: unknown) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: (event?: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  async deinitialize(): Promise<void> {
    this.calls.push('deinitialize');
  }
  emit(type: string): void {
    this.listeners.get(type)?.forEach((listener) => listener({ type }));
  }
}

const instance = { name: 'main-component' };

function make(): { native: RecordingPlayer; port: W3cPlayerAdapter } {
  const native = new RecordingPlayer();
  return { native, port: new W3cPlayerAdapter(native, () => instance) };
}

describe('W3cPlayerAdapter', () => {
  it('maps lifecycle and surface calls to the w3cmedia API', async () => {
    const { native, port } = make();
    await port.initialize();
    port.attachSurface('s1');
    port.detachSurface('s1');
    await port.deinitialize();
    expect(native.calls).toEqual(['initialize', 'setSurfaceHandle:s1', 'clearSurfaceHandle:s1', 'deinitialize']);
  });

  it('sets autoplay, source and position as properties', () => {
    const { native, port } = make();
    port.setAutoplay(false);
    port.setSrc('https://cdn.test/a.mp4');
    port.setCurrentTime(42.5);
    expect(native.autoplay).toBe(false);
    expect(native.src).toBe('https://cdn.test/a.mp4');
    expect(port.getCurrentTime()).toBe(42.5);
  });

  it('mutes through the muted property', () => {
    const { native, port } = make();
    port.setMuted(true);
    expect(native.muted).toBe(true);
    port.setMuted(false);
    expect(native.muted).toBe(false);
  });

  it('plays and pauses', async () => {
    const { native, port } = make();
    await port.play();
    port.pause();
    expect(native.calls).toEqual(['play', 'pause']);
  });

  it('reports 0 while the duration is unknown', () => {
    const { native, port } = make();
    expect(port.getDuration()).toBe(0);
    native.duration = 12.5;
    expect(port.getDuration()).toBe(12.5);
  });

  it('describes the player error from player.error', () => {
    const { native, port } = make();
    expect(port.getErrorMessage()).toBeUndefined();
    native.error = { code: 4, message: '' };
    expect(port.getErrorMessage()).toBe('MediaError 4');
    native.error = { code: 3, message: 'decode failed' };
    expect(port.getErrorMessage()).toBe('MediaError 3: decode failed');
  });

  it('gives media control focus to this player with the app component instance', async () => {
    const { native, port } = make();
    await port.takeMediaControlFocus();
    expect(native.calls).toEqual(['focus:main-component']);
  });

  it('subscribes and unsubscribes player events', () => {
    const { native, port } = make();
    const listener = jest.fn();
    const off = port.on('timeupdate', listener);
    native.emit('timeupdate');
    off();
    native.emit('timeupdate');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('drops all its listeners on deinitialize', async () => {
    const { native, port } = make();
    const listener = jest.fn();
    port.on('ended', listener);
    port.on('error', listener);
    await port.deinitialize();
    native.emit('ended');
    native.emit('error');
    expect(listener).not.toHaveBeenCalled();
  });
});
