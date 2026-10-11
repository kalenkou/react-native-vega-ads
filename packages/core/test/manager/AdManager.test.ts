import { readFileSync } from 'fs';
import { AdManager, AdSchedule, IDLE_SNAPSHOT } from '../../src/manager/AdManager';
import type { SessionSnapshot } from '../../src/machine/AdBreakSession';
import { installImagePolyfill } from '@vega-ads/vast';
import { FakeClock } from '../../../vast/test/fakes/FakeClock';
import { FakeHttp } from '../../../vast/test/fakes/FakeHttp';
import { FakePlayer } from '../fakes/FakePlayer';

const fixture = (path: string): string => readFileSync(`${__dirname}/../../../vast/fixtures/${path}`, 'utf8');
const VMAP = 'https://ads.test/vmap.xml';
const AD_A = 'ad-a';
const AD_B = 'ad-b';

const g = globalThis as Record<string, unknown>;
beforeEach(() => {
  g.window = g;
  delete g.Image;
  installImagePolyfill(new FakeHttp(), g);
});
afterEach(() => {
  delete g.window;
  delete g.Image;
});

async function settle(): Promise<void> {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

function setup(routes: Record<string, string>) {
  const http = new FakeHttp();
  Object.entries(routes).forEach(([url, body]) => http.on(url, { body }));
  const clock = new FakeClock(1_000_000);
  const content = new FakePlayer({ duration: 600 });
  void content.initialize();
  const adPlayers: FakePlayer[] = [];
  const snapshots: SessionSnapshot[] = [];
  const events: string[] = [];
  const manager = new AdManager({
    http,
    clock,
    content,
    adSurface: AD_A,
    standbySurface: AD_B,
    createAdPlayer: () => {
      const player = new FakePlayer({ duration: 10 });
      adPlayers.push(player);
      return player;
    },
    onChange: (snapshot) => snapshots.push(snapshot),
    onEvent: (name) => events.push(name),
  });
  const lastAdPlayer = (): FakePlayer => adPlayers[adPlayers.length - 1] as FakePlayer;
  const last = (): SessionSnapshot | undefined => snapshots[snapshots.length - 1];
  return { http, clock, content, adPlayers, snapshots, events, manager, lastAdPlayer, last };
}

type Ctx = ReturnType<typeof setup>;

/** Plays the only ad of the active break to its end. */
async function playAdToEnd(ctx: Ctx): Promise<void> {
  const player = ctx.lastAdPlayer();
  await player.flush();
  player.emitTime(10);
  player.emitEnded();
  await settle();
}

const manual = (breaks: Array<{ offset: 'start' | 'end' | number; vastUrl: string }>): AdSchedule => ({ breaks });

describe('AdManager', () => {
  it('plays a VMAP pre-roll before the content starts', async () => {
    const ctx = setup({
      [VMAP]: fixture('vmap/pre-mid-post.xml'),
      'https://ads.test/pre.xml': fixture('vast/inline.xml'),
    });
    const starting = ctx.manager.start({ vmapUrl: VMAP });
    await settle();
    expect(ctx.content.calls).not.toContain('play');

    ctx.lastAdPlayer().emitCanPlay();
    await starting;
    await settle();
    await ctx.lastAdPlayer().flush();
    expect(ctx.last()?.state).toBe('playing');
    expect(ctx.last()?.adSurface).toBe(AD_A);

    await playAdToEnd(ctx);
    expect(ctx.content.calls).toContain('play');
    expect(ctx.content.getCurrentTime()).toBe(0);
    expect(ctx.content.hasMediaControlFocus).toBe(true);
    expect(ctx.last()).toEqual(IDLE_SNAPSHOT);
  });

  it('keeps a loading pre-roll when the content player reports time before it plays (Shaka)', async () => {
    const ctx = setup({ 'https://ads.test/pre.xml': fixture('vast/inline.xml') });
    const starting = ctx.manager.start(manual([{ offset: 'start', vastUrl: 'https://ads.test/pre.xml' }]));
    await settle();
    ctx.content.emitTime(0); // an adaptive player sends timeupdate while it loads
    await settle();
    ctx.lastAdPlayer().emitCanPlay();
    await starting;
    await settle();
    await ctx.lastAdPlayer().flush();
    await settle();
    expect(ctx.last()?.state).toBe('playing');
    expect(ctx.lastAdPlayer().deinitialized).toBe(false);
  });

  it('starts the content at once when there is no pre-roll', async () => {
    const ctx = setup({ 'https://ads.test/mid.xml': fixture('vast/inline.xml') });
    await ctx.manager.start(manual([{ offset: 30, vastUrl: 'https://ads.test/mid.xml' }]));
    expect(ctx.content.calls).toContain('play');
    expect(ctx.http.requests).toEqual([]);
  });

  it('starts the content when the VMAP request fails', async () => {
    const ctx = setup({});
    await ctx.manager.start({ vmapUrl: VMAP });
    expect(ctx.content.calls).toContain('play');
    expect(ctx.events).toContain('vmap:error:1008');
  });

  it('starts the content when the pre-roll has no ads', async () => {
    const ctx = setup({ 'https://ads.test/pre.xml': fixture('vast/empty.xml') });
    await ctx.manager.start(manual([{ offset: 'start', vastUrl: 'https://ads.test/pre.xml' }]));
    await settle();
    expect(ctx.content.calls).toContain('play');
    expect(ctx.last()?.state ?? 'idle').toBe('idle');
  });

  it('prefetches a mid-roll and pauses the content at its time', async () => {
    const ctx = setup({ 'https://ads.test/mid.xml': fixture('vast/inline.xml') });
    await ctx.manager.start(manual([{ offset: 30, vastUrl: 'https://ads.test/mid.xml' }]));
    ctx.content.emitTime(10);
    await settle();
    expect(ctx.http.requests).toEqual([]);

    ctx.content.emitTime(15); // 15 s before the break (R10)
    await settle();
    expect(ctx.http.requests).toEqual(['https://ads.test/mid.xml']);
    ctx.lastAdPlayer().emitCanPlay();
    await settle();

    ctx.content.emitTime(30);
    await settle();
    expect(ctx.content.paused).toBe(true);
    await ctx.lastAdPlayer().flush();
    expect(ctx.last()?.state).toBe('playing');

    await playAdToEnd(ctx);
    expect(ctx.content.calls.filter((c) => c === 'seek:30')).toHaveLength(1);
    expect(ctx.lastAdPlayer().deinitialized).toBe(true);
  });

  it('ignores content time while a break plays', async () => {
    const ctx = setup({
      'https://ads.test/mid.xml': fixture('vast/inline.xml'),
      'https://ads.test/mid2.xml': fixture('vast/inline.xml'),
    });
    await ctx.manager.start(
      manual([
        { offset: 30, vastUrl: 'https://ads.test/mid.xml' },
        { offset: 100, vastUrl: 'https://ads.test/mid2.xml' },
      ]),
    );
    ctx.content.emitTime(29);
    await settle();
    ctx.lastAdPlayer().emitCanPlay();
    await settle();
    ctx.content.emitTime(30);
    await settle();

    // A late timeupdate from the content player while the ad plays.
    ctx.content.emitTime(90);
    await settle();
    expect(ctx.http.requests).toEqual(['https://ads.test/mid.xml']);
  });

  it('skips a mid-roll that is not loaded when its time comes and keeps the content playing', async () => {
    const ctx = setup({});
    ctx.http.hang('https://ads.test/slow.xml');
    await ctx.manager.start(manual([{ offset: 30, vastUrl: 'https://ads.test/slow.xml' }]));
    ctx.content.emitTime(20);
    await settle();
    ctx.content.emitTime(30);
    await settle();
    expect(ctx.content.paused).toBe(false);
    expect(ctx.events).toContain('break:break-1:late');
  });

  it('releases the ad player of a prefetched break that a seek jumped over', async () => {
    const ctx = setup({
      'https://ads.test/mid.xml': fixture('vast/inline.xml'),
      'https://ads.test/mid2.xml': fixture('vast/inline.xml'),
    });
    await ctx.manager.start(
      manual([
        { offset: 30, vastUrl: 'https://ads.test/mid.xml' },
        { offset: 200, vastUrl: 'https://ads.test/mid2.xml' },
      ]),
    );
    ctx.content.emitTime(20);
    await settle();
    const prefetched = ctx.lastAdPlayer();
    prefetched.emitCanPlay();
    await settle();

    // Seek back to the start: the break at 30 s is still ahead, nothing is released.
    ctx.content.emitTime(2);
    await settle();
    expect(prefetched.deinitialized).toBe(false);

    // Seek far forward over both breaks: only the last one (200 s) plays (R24); 30 s is gone.
    ctx.content.emitTime(250);
    await settle();
    expect(prefetched.deinitialized).toBe(true);
  });

  it('resumes without repeating the pre-roll or passed breaks', async () => {
    const ctx = setup({
      'https://ads.test/pre.xml': fixture('vast/inline.xml'),
      'https://ads.test/mid.xml': fixture('vast/inline.xml'),
    });
    await ctx.manager.start(
      manual([
        { offset: 'start', vastUrl: 'https://ads.test/pre.xml' },
        { offset: 30, vastUrl: 'https://ads.test/mid.xml' },
      ]),
      { resumeAt: 45 },
    );
    expect(ctx.http.requests).toEqual([]);
    expect(ctx.content.calls).toContain('play');
    ctx.content.emitTime(46);
    await settle();
    expect(ctx.http.requests).toEqual([]);
  });

  it('starts the content and reports the error when starting the schedule fails', async () => {
    const ctx = setup({});
    let first = true;
    const play = ctx.content.play.bind(ctx.content);
    ctx.content.play = () => {
      if (first) {
        first = false;
        return Promise.reject(new Error('player busy'));
      }
      return play();
    };
    await expect(ctx.manager.start(manual([]))).resolves.toBeUndefined();
    expect(ctx.events).toContain('error:start');
    expect(ctx.content.calls).toContain('play');
  });

  it('plays the post-roll when the content ends', async () => {
    const ctx = setup({ 'https://ads.test/post.xml': fixture('vast/inline.xml') });
    await ctx.manager.start(manual([{ offset: 'end', vastUrl: 'https://ads.test/post.xml' }]));
    ctx.content.emitTime(590);
    await settle();
    ctx.lastAdPlayer().emitCanPlay();
    await settle();
    ctx.content.emitEnded();
    await settle();
    await ctx.lastAdPlayer().flush();
    expect(ctx.last()?.state).toBe('playing');
  });

  it('togglePause() pauses the ad on screen and is false between breaks', async () => {
    const ctx = setup({ 'https://ads.test/pre.xml': fixture('vast/inline.xml') });
    const starting = ctx.manager.start(manual([{ offset: 'start', vastUrl: 'https://ads.test/pre.xml' }]));
    await settle();
    ctx.lastAdPlayer().emitCanPlay();
    await starting;
    await settle();
    await ctx.lastAdPlayer().flush();
    expect(ctx.manager.togglePause()).toBe(true);
    expect(ctx.lastAdPlayer().paused).toBe(true);
    await playAdToEnd(ctx);
    expect(ctx.manager.togglePause()).toBe(false);
  });

  it('after the post-roll the content is not played again from the start (C2-5)', async () => {
    const ctx = setup({ 'https://ads.test/post.xml': fixture('vast/inline.xml') });
    await ctx.manager.start(manual([{ offset: 'end', vastUrl: 'https://ads.test/post.xml' }]));
    ctx.content.emitTime(590);
    await settle();
    ctx.lastAdPlayer().emitCanPlay();
    await settle();
    ctx.content.emitTime(600);
    ctx.content.emitEnded();
    await settle();
    await ctx.lastAdPlayer().flush();
    const playsBefore = ctx.content.calls.filter((c) => c === 'play').length;
    await playAdToEnd(ctx);
    expect(ctx.content.calls.filter((c) => c === 'play')).toHaveLength(playsBefore);
    expect(ctx.content.hasMediaControlFocus).toBe(true);
    expect(ctx.events).toContain('content:ended');
  });

  it('reports content:ended at once when there is no post-roll', async () => {
    const ctx = setup({});
    await ctx.manager.start(manual([]));
    ctx.content.emitEnded();
    await settle();
    expect(ctx.events).toContain('content:ended');
  });

  it('skip() passes to the active break and is false without one', async () => {
    const ctx = setup({});
    await ctx.manager.start(manual([]));
    expect(ctx.manager.skip()).toBe(false);
  });

  it('back() leaves the break and returns to the content (R23)', async () => {
    const ctx = setup({ 'https://ads.test/pre.xml': fixture('vast/inline.xml') });
    const starting = ctx.manager.start(manual([{ offset: 'start', vastUrl: 'https://ads.test/pre.xml' }]));
    await settle();
    ctx.lastAdPlayer().emitCanPlay();
    await starting;
    await settle();
    await ctx.lastAdPlayer().flush();

    await ctx.manager.back();
    expect(ctx.lastAdPlayer().deinitialized).toBe(true);
    expect(ctx.content.calls).toContain('play');
    expect(ctx.last()).toEqual(IDLE_SNAPSHOT);
  });

  it('dispose() releases every ad player, stops listening and leaves the content alone', async () => {
    const ctx = setup({
      'https://ads.test/mid.xml': fixture('vast/inline.xml'),
      'https://ads.test/mid2.xml': fixture('vast/inline.xml'),
    });
    await ctx.manager.start(
      manual([
        { offset: 30, vastUrl: 'https://ads.test/mid.xml' },
        { offset: 300, vastUrl: 'https://ads.test/mid2.xml' },
      ]),
    );
    ctx.content.emitTime(20);
    await settle();
    ctx.lastAdPlayer().emitCanPlay();
    await settle();
    const playsBefore = ctx.content.calls.filter((c) => c === 'play').length;

    await ctx.manager.dispose();
    expect(ctx.adPlayers.every((p) => p.deinitialized)).toBe(true);
    ctx.content.emitTime(290);
    await settle();
    expect(ctx.http.requests).toEqual(['https://ads.test/mid.xml']);
    expect(ctx.content.calls.filter((c) => c === 'play')).toHaveLength(playsBefore);
  });

  it('suspend() in the background releases the ad players; wake() returns to the content without repeating the break (R13)', async () => {
    const ctx = setup({ 'https://ads.test/pre.xml': fixture('vast/inline.xml') });
    const starting = ctx.manager.start(manual([{ offset: 'start', vastUrl: 'https://ads.test/pre.xml' }]));
    await settle();
    ctx.lastAdPlayer().emitCanPlay();
    await starting;
    await settle();
    await ctx.lastAdPlayer().flush();
    const ad = ctx.lastAdPlayer();

    await ctx.manager.suspend();
    expect(ad.deinitialized).toBe(true);
    expect(ctx.content.calls).not.toContain('play');

    await ctx.manager.wake();
    expect(ctx.content.calls.slice(-3)).toEqual(['seek:0', 'play', 'focus']);
    expect(ctx.last()).toEqual(IDLE_SNAPSHOT);
    expect(ctx.events).toContain('break:break-1:interrupted');
    expect(ctx.http.requests.filter((u) => u === 'https://ads.test/pre.xml')).toHaveLength(1);
  });

  it('suspend() releases a prefetched break, and it is prefetched again after wake()', async () => {
    const ctx = setup({ 'https://ads.test/mid.xml': fixture('vast/inline.xml') });
    await ctx.manager.start(manual([{ offset: 30, vastUrl: 'https://ads.test/mid.xml' }]));
    ctx.content.emitTime(20);
    await settle();
    const prefetched = ctx.lastAdPlayer();
    prefetched.emitCanPlay();
    await settle();
    await ctx.manager.suspend();
    expect(prefetched.deinitialized).toBe(true);
    await ctx.manager.wake();
    ctx.content.emitTime(21);
    await settle();
    expect(ctx.http.requests.filter((u) => u === 'https://ads.test/mid.xml')).toHaveLength(2);
  });

  it('suspend() while the pre-roll loads: nothing plays in the background, the content starts on wake(), later breaks still run', async () => {
    const ctx = setup({
      'https://ads.test/pre.xml': fixture('vast/inline.xml'),
      'https://ads.test/mid.xml': fixture('vast/inline.xml'),
    });
    const starting = ctx.manager.start(
      manual([
        { offset: 'start', vastUrl: 'https://ads.test/pre.xml' },
        { offset: 30, vastUrl: 'https://ads.test/mid.xml' },
      ]),
    );
    await settle();
    const pre = ctx.lastAdPlayer();
    void ctx.manager.suspend();
    pre.emitCanPlay();
    await starting;
    await settle();
    expect(pre.deinitialized).toBe(true);
    expect(ctx.content.calls).not.toContain('play');
    expect(ctx.events).not.toContain('error:start');

    await ctx.manager.wake();
    expect(ctx.content.calls).toContain('play');
    expect(ctx.events).toContain('break:break-1:interrupted');
    ctx.content.emitTime(20);
    await settle();
    expect(ctx.http.requests).toContain('https://ads.test/mid.xml');
  });

  it('suspend() and wake() both before the pre-roll loads: the content starts without the pre-roll', async () => {
    const ctx = setup({ 'https://ads.test/pre.xml': fixture('vast/inline.xml') });
    const starting = ctx.manager.start(manual([{ offset: 'start', vastUrl: 'https://ads.test/pre.xml' }]));
    await settle();
    const pre = ctx.lastAdPlayer();
    await ctx.manager.suspend();
    await ctx.manager.wake();
    pre.emitCanPlay();
    await starting;
    await settle();
    expect(ctx.content.calls).toContain('play');
    expect(ctx.adPlayers.every((p) => p.deinitialized)).toBe(true);
  });

  it('suspend() while the last ad player is being released: the content stays paused, one breakEnd after wake() (C3-8)', async () => {
    const ctx = setup({ 'https://ads.test/pre.xml': fixture('vast/inline.xml') });
    const starting = ctx.manager.start(manual([{ offset: 'start', vastUrl: 'https://ads.test/pre.xml' }]));
    await settle();
    ctx.lastAdPlayer().emitCanPlay();
    await starting;
    await settle();
    const ad = ctx.lastAdPlayer();
    await ad.flush();
    ad.emitTime(10);
    ad.emitEnded(); // the session now awaits the release of the ad player ...
    void ctx.manager.suspend(); // ... and Home comes in that window
    await settle();
    expect(ctx.content.calls).not.toContain('play');
    await ctx.manager.wake();
    await settle();
    expect(ctx.content.calls).toContain('play');
    expect(ctx.events.filter((e) => e === 'breakEnd')).toHaveLength(1);
  });

  it('dispose() during an ad gives media controls back to the content without playing it', async () => {
    const ctx = setup({ 'https://ads.test/pre.xml': fixture('vast/inline.xml') });
    const starting = ctx.manager.start(manual([{ offset: 'start', vastUrl: 'https://ads.test/pre.xml' }]));
    await settle();
    ctx.lastAdPlayer().emitCanPlay();
    await starting;
    await settle();
    await ctx.lastAdPlayer().flush();
    ctx.content.hasMediaControlFocus = false;
    await ctx.manager.dispose();
    expect(ctx.content.hasMediaControlFocus).toBe(true);
    expect(ctx.content.calls).not.toContain('play');
  });

  it('dispose() while the VAST request is in flight leaves no live ad player (C3-7)', async () => {
    const ctx = setup({});
    let answer: (body: string) => void = () => undefined;
    const get = ctx.http.get.bind(ctx.http);
    ctx.http.get = (url, options) =>
      url === 'https://ads.test/pre.xml'
        ? new Promise((resolve) => {
            answer = (body) => resolve({ status: 200, ok: true, text: () => Promise.resolve(body) });
          })
        : get(url, options);
    const starting = ctx.manager.start(manual([{ offset: 'start', vastUrl: 'https://ads.test/pre.xml' }]));
    await settle();
    await ctx.manager.dispose();
    answer(fixture('vast/inline.xml'));
    await settle();
    ctx.adPlayers.forEach((p) => p.emitCanPlay());
    await starting;
    await settle();
    expect(ctx.adPlayers.every((p) => p.deinitialized)).toBe(true);
    expect(ctx.content.calls).not.toContain('play');
  });

  it('dispose() during the VMAP request starts nothing', async () => {
    const ctx = setup({});
    ctx.http.hang(VMAP);
    const starting = ctx.manager.start({ vmapUrl: VMAP });
    await ctx.manager.dispose();
    ctx.clock.advance(10_000); // VMAP timeout
    await starting;
    expect(ctx.content.calls).not.toContain('play');
  });
});
