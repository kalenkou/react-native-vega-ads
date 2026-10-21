import { HtmlVideoPort, VideoElement } from '../src/HtmlVideoPort';

class FakeVideo implements VideoElement {
  autoplay = false;
  muted = false;
  volume = 1;
  src = '';
  currentTime = 0;
  duration = NaN;
  parentElement: { id: string } | null = null;
  played = 0;
  paused = 0;
  loaded = 0;
  removed = 0;
  removedAttributes: string[] = [];
  removals = 0;
  playResult: () => Promise<void> = () => Promise.resolve();
  readonly listeners = new Map<string, Set<() => void>>();

  play(): Promise<void> {
    this.played += 1;
    return this.playResult();
  }
  pause(): void {
    this.paused += 1;
  }
  load(): void {
    this.loaded += 1;
  }
  remove(): void {
    this.removed += 1;
    this.parentElement = null;
  }
  removeAttribute(name: string): void {
    this.removedAttributes.push(name);
  }
  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.removals += 1;
    this.listeners.get(type)?.delete(listener);
  }
  fire(type: string): void {
    [...(this.listeners.get(type) ?? [])].forEach((listener) => listener());
  }
  count(): number {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }
}

function surfaces(...ids: string[]) {
  const appended: Array<{ id: string; video: FakeVideo }> = [];
  const find = (id: string) =>
    ids.includes(id)
      ? {
          appendChild: (video: FakeVideo) => {
            appended.push({ id, video });
            video.parentElement = { id };
          },
        }
      : null;
  return { find: find as never, appended };
}

describe('HtmlVideoPort', () => {
  it('passes the simple properties through to the element', async () => {
    const video = new FakeVideo();
    const port = new HtmlVideoPort(video);
    await port.initialize();
    port.setAutoplay(true);
    port.setSrc('https://cdn.example/ad.mp4');
    port.setMuted(true);
    port.setVolume(0.4);
    port.setCurrentTime(12);
    expect(video).toMatchObject({
      autoplay: true,
      src: 'https://cdn.example/ad.mp4',
      muted: true,
      volume: 0.4,
      currentTime: 12,
    });
    expect(port.getCurrentTime()).toBe(12);
    port.pause();
    expect(video.paused).toBe(1);
    await expect(port.takeMediaControlFocus()).resolves.toBeUndefined();
  });

  it('reports 0 while the duration is unknown', () => {
    const video = new FakeVideo();
    const port = new HtmlVideoPort(video);
    expect(port.getDuration()).toBe(0);
    video.duration = Infinity;
    expect(port.getDuration()).toBe(0);
    video.duration = 10.5;
    expect(port.getDuration()).toBe(10.5);
  });

  it('puts the element into the surface with the given id and takes it out again', () => {
    const video = new FakeVideo();
    const { find, appended } = surfaces('ad-a');
    const port = new HtmlVideoPort(video, find);
    port.attachSurface('ad-a');
    expect(appended).toEqual([{ id: 'ad-a', video }]);
    port.detachSurface('ad-b');
    expect(video.removed).toBe(0);
    port.detachSurface('ad-a');
    expect(video.removed).toBe(1);
  });

  it('ignores a surface that is not on the page', () => {
    const video = new FakeVideo();
    const { find, appended } = surfaces();
    const port = new HtmlVideoPort(video, find);
    port.attachSurface('missing');
    expect(appended).toEqual([]);
  });

  it('leaves a content element where it is: no surfaces by default', () => {
    const video = new FakeVideo();
    video.parentElement = { id: 'content' };
    const port = new HtmlVideoPort(video);
    port.attachSurface('content');
    port.detachSurface('other');
    expect(video.parentElement).toEqual({ id: 'content' });
  });

  it('plays muted when the browser blocks sound, and says so once', async () => {
    const video = new FakeVideo();
    video.playResult = () =>
      video.muted
        ? Promise.resolve()
        : Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    const blocked = jest.fn();
    const port = new HtmlVideoPort(video, undefined, blocked);
    await port.play();
    expect(video.muted).toBe(true);
    expect(video.played).toBe(2);
    expect(blocked).toHaveBeenCalledTimes(1);
  });

  it('passes other play errors on', async () => {
    const video = new FakeVideo();
    video.playResult = () => Promise.reject(Object.assign(new Error('bad file'), { name: 'NotSupportedError' }));
    const blocked = jest.fn();
    const port = new HtmlVideoPort(video, undefined, blocked);
    await expect(port.play()).rejects.toThrow('bad file');
    expect(video.muted).toBe(false);
    expect(blocked).not.toHaveBeenCalled();
  });

  it('does not retry when the element was already muted', async () => {
    const video = new FakeVideo();
    video.muted = true;
    video.playResult = () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    const port = new HtmlVideoPort(video);
    await expect(port.play()).rejects.toThrow('blocked');
    expect(video.played).toBe(1);
  });

  it('subscribes to element events and unsubscribes', () => {
    const video = new FakeVideo();
    const port = new HtmlVideoPort(video);
    const listener = jest.fn();
    const off = port.on('ended', listener);
    video.fire('ended');
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    video.fire('ended');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(video.count()).toBe(0);
  });

  it('forgets a listener once it is unsubscribed', async () => {
    const video = new FakeVideo();
    const port = new HtmlVideoPort(video);
    const off = port.on('pause', () => undefined);
    off();
    await port.deinitialize();
    expect(video.removals).toBe(1);
  });

  it('releases the element: stops loading, takes it off the page and drops its listeners', async () => {
    const video = new FakeVideo();
    const { find } = surfaces('ad-a');
    const port = new HtmlVideoPort(video, find);
    port.attachSurface('ad-a');
    port.on('timeupdate', () => undefined);
    port.on('ended', () => undefined);
    await port.deinitialize();
    expect(video.paused).toBe(1);
    expect(video.removedAttributes).toEqual(['src']);
    expect(video.loaded).toBe(1);
    expect(video.removed).toBe(1);
    expect(video.count()).toBe(0);
  });

  it('keeps a content element on the page when released', async () => {
    const video = new FakeVideo();
    video.parentElement = { id: 'content' };
    const port = new HtmlVideoPort(video);
    port.on('ended', () => undefined);
    await port.deinitialize();
    expect(video.removed).toBe(0);
    expect(video.removedAttributes).toEqual([]);
    expect(video.count()).toBe(0);
  });
});
