import { FakePlayer } from './FakePlayer';

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
    player.on('error', () => events.push('error'));
    player.emitTime(2.5);
    player.emitEnded();
    player.emitError();
    expect(events).toEqual(['t2.5', 'ended', 'error']);
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
