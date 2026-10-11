import { FakeClock } from './FakeClock';
import { FakeHttp } from './FakeHttp';
import { FakePlayer } from './FakePlayer';

describe('FakeClock', () => {
  it('runs timers in time order when time advances', () => {
    const clock = new FakeClock(1000);
    const calls: string[] = [];
    clock.setTimeout(() => calls.push('b'), 200);
    clock.setTimeout(() => calls.push('a'), 100);
    clock.advance(150);
    expect(calls).toEqual(['a']);
    expect(clock.now()).toBe(1150);
    clock.advance(100);
    expect(calls).toEqual(['a', 'b']);
  });

  it('does not run a cleared timer', () => {
    const clock = new FakeClock();
    const callback = jest.fn();
    const handle = clock.setTimeout(callback, 10);
    clock.clearTimeout(handle);
    clock.advance(20);
    expect(callback).not.toHaveBeenCalled();
  });
});

describe('FakeHttp', () => {
  it('returns the registered body and status', async () => {
    const http = new FakeHttp().on('https://a.test/vast', { status: 200, body: '<VAST/>' });
    const response = await http.get('https://a.test/vast');
    expect(response.ok).toBe(true);
    await expect(response.text()).resolves.toBe('<VAST/>');
    expect(http.requests).toEqual(['https://a.test/vast']);
  });

  it('answers 404 for unknown URLs', async () => {
    const response = await new FakeHttp().get('https://a.test/missing');
    expect(response.status).toBe(404);
    expect(response.ok).toBe(false);
  });

  it('never answers a hanging URL and rejects with AbortError on abort', async () => {
    const http = new FakeHttp().hang('https://a.test/slow');
    const controller = new AbortController();
    const pending = http.get('https://a.test/slow', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects with a network error', async () => {
    const http = new FakeHttp().fail('https://a.test/down');
    await expect(http.get('https://a.test/down')).rejects.toThrow('network');
  });
});

describe('FakePlayer (mirrors w3cmedia behaviour)', () => {
  it('throws if used before initialize resolves', () => {
    const player = new FakePlayer();
    expect(() => player.setSrc('https://a.test/ad.mp4')).toThrow('not initialized');
  });

  it('resolves play() at once and emits playing later', async () => {
    const player = new FakePlayer();
    await player.initialize();
    player.setSrc('https://a.test/ad.mp4');
    const playing = jest.fn();
    player.on('playing', playing);
    await player.play();
    expect(playing).not.toHaveBeenCalled();
    await player.flush();
    expect(playing).toHaveBeenCalledTimes(1);
  });

  it('ignores detachSurface with a different handle', async () => {
    const player = new FakePlayer();
    await player.initialize();
    player.attachSurface('h1');
    player.detachSurface('h2');
    expect(player.surface).toBe('h1');
    player.detachSurface('h1');
    expect(player.surface).toBeNull();
  });

  it('lets tests drive time, end and errors', async () => {
    const player = new FakePlayer({ duration: 10 });
    await player.initialize();
    const events: string[] = [];
    player.on('timeupdate', () => events.push(`t${player.getCurrentTime()}`));
    player.on('ended', () => events.push('ended'));
    player.on('error', () => events.push(`error:${player.getErrorMessage() ?? ''}`));
    player.emitTime(2.5);
    player.emitEnded();
    player.emitError('decode failed');
    expect(events).toEqual(['t2.5', 'ended', 'error:decode failed']);
  });

  it('stops emitting after unsubscribe and after deinitialize', async () => {
    const player = new FakePlayer();
    await player.initialize();
    const listener = jest.fn();
    const off = player.on('timeupdate', listener);
    off();
    player.emitTime(1);
    expect(listener).not.toHaveBeenCalled();
    player.on('timeupdate', listener);
    await player.deinitialize();
    player.emitTime(2);
    expect(listener).not.toHaveBeenCalled();
    expect(player.deinitialized).toBe(true);
  });
});
