import { rnvPlayerPort, RnvPlayerLike } from '../src/rnvPlayerPort';

/** The public surface of a react-native-video v7 VideoPlayer that the adapter uses. */
class FakeRnvPlayer implements RnvPlayerLike {
  currentTime = 0;
  duration = Number.NaN;
  muted = false;
  readonly calls: string[] = [];
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  initialize(): Promise<void> {
    this.calls.push('initialize');
    return Promise.resolve();
  }
  play(): void {
    this.calls.push('play');
  }
  pause(): void {
    this.calls.push('pause');
  }
  seekTo(time: number): void {
    this.calls.push(`seekTo:${time}`);
  }
  replaceSourceAsync(source: { uri: string } | null): Promise<void> {
    this.calls.push(`source:${source?.uri ?? 'null'}`);
    return Promise.resolve();
  }
  addEventListener(event: string, listener: (...args: unknown[]) => void): { remove(): void } {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
    return { remove: () => set.delete(listener) };
  }
  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
  listenerCount(): number {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }
}

describe('rnvPlayerPort', () => {
  it('passes the commands vega-ads gives the content player to the RNV player', async () => {
    const rnv = new FakeRnvPlayer();
    const port = rnvPlayerPort(rnv);
    await port.initialize();
    await port.play();
    port.pause();
    port.setCurrentTime(42.5);
    port.setMuted(true);
    rnv.currentTime = 12;
    expect(rnv.calls).toEqual(['initialize', 'play', 'pause', 'seekTo:42.5']);
    expect(rnv.muted).toBe(true);
    expect(port.getCurrentTime()).toBe(12);
  });

  it('reports 0 while the duration is unknown, then the duration', () => {
    const rnv = new FakeRnvPlayer();
    const port = rnvPlayerPort(rnv);
    expect(port.getDuration()).toBe(0);
    rnv.duration = 734.2;
    expect(port.getDuration()).toBe(734.2);
  });

  it('leaves the surface and autoplay to <VideoView> and the backend', () => {
    const rnv = new FakeRnvPlayer();
    const port = rnvPlayerPort(rnv);
    port.attachSurface('s1');
    port.detachSurface('s1');
    port.setAutoplay(true);
    expect(rnv.calls).toEqual([]);
  });

  it('maps the RNV events to the player events vega-ads listens to', () => {
    const rnv = new FakeRnvPlayer();
    const port = rnvPlayerPort(rnv);
    const heard: string[] = [];
    (['timeupdate', 'ended', 'playing', 'pause', 'waiting', 'canplay', 'error'] as const).forEach((name) =>
      port.on(name, () => heard.push(name)),
    );
    rnv.emit('onProgress', { currentTime: 1 });
    rnv.emit('onEnd');
    rnv.emit('onPlaybackStateChange', { isPlaying: true, isBuffering: false });
    rnv.emit('onPlaybackStateChange', { isPlaying: false, isBuffering: false });
    rnv.emit('onPlaybackStateChange', { isBuffering: true }); // no play state: neither event
    rnv.emit('onBuffer', true);
    rnv.emit('onBuffer', false);
    rnv.emit('onStatusChange', 'loading');
    rnv.emit('onStatusChange', 'readyToPlay');
    rnv.emit('onError', { code: 'source/network', message: 'HTTP 403' });
    expect(heard).toEqual(['timeupdate', 'ended', 'playing', 'pause', 'waiting', 'canplay', 'error']);
  });

  it('stops a listener when vega-ads unsubscribes, and all of them on deinitialize', async () => {
    const rnv = new FakeRnvPlayer();
    const port = rnvPlayerPort(rnv);
    let times = 0;
    const off = port.on('timeupdate', () => (times += 1));
    port.on('ended', () => undefined);
    rnv.emit('onProgress', {});
    off();
    rnv.emit('onProgress', {});
    expect(times).toBe(1);

    await port.deinitialize();
    expect(rnv.listenerCount()).toBe(0);
    expect(rnv.calls).toEqual([]); // the app's useVideoPlayer owns the player and releases it
  });

  it('gives media controls focus through the backend when the app passes it, otherwise does nothing', async () => {
    const rnv = new FakeRnvPlayer();
    await expect(rnvPlayerPort(rnv).takeMediaControlFocus()).resolves.toBeUndefined();
    let focused = 0;
    await rnvPlayerPort(rnv, { takeMediaControlFocus: async () => void (focused += 1) }).takeMediaControlFocus();
    expect(focused).toBe(1);
  });

  it('sets a new source through the RNV player', () => {
    const rnv = new FakeRnvPlayer();
    rnvPlayerPort(rnv).setSrc('https://media.test/movie.mp4');
    expect(rnv.calls).toEqual(['source:https://media.test/movie.mp4']);
  });
});
