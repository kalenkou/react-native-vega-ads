import { readFileSync } from 'fs';
import { AdManager, AdManagerDeps, AdSchedule, AdTimeline, IDLE_SNAPSHOT } from '../../src/manager/AdManager';
import { PreloadedAds, preloadAds } from '../../src/manager/preloadAds';
import type { SessionSnapshot } from '../../src/machine/AdBreakSession';
import { installImagePolyfill } from '../../src/vast';
import { FakeClock } from '../fakes/FakeClock';
import { FakeHttp } from '../fakes/FakeHttp';
import { FakePlayer } from '../fakes/FakePlayer';

const fixture = (path: string): string => readFileSync(`${__dirname}/../../fixtures/${path}`, 'utf8');
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

function setup(routes: Record<string, string>, options: Pick<AdManagerDeps, 'avoidRepeats' | 'maxBreakAds' | 'maxBreakSeconds' | 'pauseAdUrl' | 'onPauseAd' | 'contentLoudness'> = {}) {
  const http = new FakeHttp();
  Object.entries(routes).forEach(([url, body]) => http.on(url, { body }));
  const clock = new FakeClock(1_000_000);
  const content = new FakePlayer({ duration: 600 });
  void content.initialize();
  const adPlayers: FakePlayer[] = [];
  const snapshots: SessionSnapshot[] = [];
  const events: string[] = [];
  const timelines: AdTimeline[] = [];
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
    onTimeline: (timeline) => timelines.push(timeline),
    ...options,
  });
  const lastAdPlayer = (): FakePlayer => adPlayers[adPlayers.length - 1] as FakePlayer;
  const last = (): SessionSnapshot | undefined => snapshots[snapshots.length - 1];
  return { http, clock, content, adPlayers, snapshots, events, timelines, manager, lastAdPlayer, last };
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

  it('plays one ad from an ad source with allowMultipleAds="false", even when it answers with a pod', async () => {
    const ctx = setup({
      [VMAP]: fixture('vmap/pre-mid-post.xml'),
      'https://ads.test/pre.xml': fixture('vast/pod-optimized.xml'),
    });
    const starting = ctx.manager.start({ vmapUrl: VMAP });
    await settle();
    ctx.lastAdPlayer().emitCanPlay();
    await starting;
    await settle();
    expect(ctx.last()).toMatchObject({ position: 1, total: 1 });
    expect(ctx.lastAdPlayer().calls.find((c) => c.startsWith('src:'))).toContain('pod-1');
  });

  it('treats a break given at 0 s as the pre-roll', async () => {
    const ctx = setup({ 'https://ads.test/pre.xml': fixture('vast/inline.xml') });
    const starting = ctx.manager.start(manual([{ offset: 0, vastUrl: 'https://ads.test/pre.xml' }]));
    await settle();
    expect(ctx.content.calls).not.toContain('play');
    ctx.lastAdPlayer().emitCanPlay();
    await starting;
    await settle();
    expect(ctx.events.some((e) => e.endsWith(':late'))).toBe(false);
    expect(ctx.last()?.state).not.toBe('idle');
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
    // The content did not move during the break, so it plays on from 30 s without a seek.
    expect(ctx.content.calls.filter((c) => c.startsWith('seek'))).toEqual([]);
    expect(ctx.content.getCurrentTime()).toBe(30);
    expect(ctx.content.calls.slice(-2)).toEqual(['play', 'focus']);
    expect(ctx.lastAdPlayer().deinitialized).toBe(true);
  });

  /** Plays a pre-roll of inline.xml, then reaches a mid-roll at 30 s that brings the same creative. */
  async function preThenSameMid(avoidRepeats?: false | { withinMs: number }) {
    const ctx = setup(
      { 'https://ads.test/pre.xml': fixture('vast/inline.xml'), 'https://ads.test/mid.xml': fixture('vast/inline.xml') },
      { avoidRepeats },
    );
    const starting = ctx.manager.start(
      manual([
        { offset: 'start', vastUrl: 'https://ads.test/pre.xml' },
        { offset: 30, vastUrl: 'https://ads.test/mid.xml' },
      ]),
    );
    await settle();
    ctx.lastAdPlayer().emitCanPlay();
    await starting;
    await settle();
    await playAdToEnd(ctx);
    const players = ctx.adPlayers.length;
    ctx.clock.advance(15_000);
    ctx.content.emitTime(15);
    await settle();
    if (ctx.adPlayers.length > players) {
      ctx.lastAdPlayer().emitCanPlay();
      await settle();
    }
    ctx.content.emitTime(30);
    await settle();
    return ctx;
  }

  it('with a memory, leaves out a pre-roll the household saw in another title, even when the memory answers late', async () => {
    let stored: string | null = null;
    let release = (): void => undefined;
    let late = false;
    const memory = {
      read: () =>
        late ? new Promise<string | null>((resolve) => (release = () => resolve(stored))) : Promise.resolve(stored),
      write: async (value: string) => {
        stored = value;
      },
    };
    const routes = { 'https://ads.test/pre.xml': fixture('vast/inline.xml') };
    const first = setup(routes, { avoidRepeats: { memory } });
    const starting = first.manager.start(manual([{ offset: 'start', vastUrl: 'https://ads.test/pre.xml' }]));
    await settle();
    first.lastAdPlayer().emitCanPlay();
    await starting;
    await settle();
    await playAdToEnd(first);
    expect(stored).not.toBeNull();

    late = true;
    const second = setup(routes, { avoidRepeats: { memory } });
    const next = second.manager.start(manual([{ offset: 'start', vastUrl: 'https://ads.test/pre.xml' }]));
    await settle();
    expect(second.adPlayers).toHaveLength(0);
    release();
    await next;
    await settle();
    expect(second.adPlayers).toHaveLength(0);
    expect(second.events).toContain('skipped:repeat');
    expect(second.content.calls).toContain('play');
  });

  it('starts no ad when the viewer leaves while the memory is read', async () => {
    let release = (): void => undefined;
    const memory = {
      read: () => new Promise<string | null>((resolve) => (release = () => resolve(null))),
      write: async () => undefined,
    };
    const ctx = setup({ 'https://ads.test/pre.xml': fixture('vast/inline.xml') }, { avoidRepeats: { memory } });
    void ctx.manager.start(manual([{ offset: 'start', vastUrl: 'https://ads.test/pre.xml' }]));
    await settle();
    ctx.manager.dispose();
    release();
    await settle();
    expect(ctx.adPlayers).toHaveLength(0);
  });

  describe('never louder than the content', () => {
    async function preRoll(file: string, options: Pick<AdManagerDeps, 'contentLoudness'>) {
      const ctx = setup({ 'https://ads.test/pre.xml': fixture(file) }, options);
      const starting = ctx.manager.start(manual([{ offset: 'start', vastUrl: 'https://ads.test/pre.xml' }]));
      await settle();
      ctx.lastAdPlayer().emitCanPlay();
      await starting;
      await settle();
      return ctx;
    }

    it('turns a louder ad down to the content loudness before it plays', async () => {
      const ctx = await preRoll('vast/inline-loud.xml', { contentLoudness: -24 });
      // -16 LUFS ad, -24 LUFS content: 8 dB down, 10^(-8/20).
      expect(ctx.lastAdPlayer().calls.filter((c) => c.startsWith('volume') || c.startsWith('src'))).toEqual([
        'volume:0.398',
        'src:https://cdn.test/ad-720.mp4',
      ]);
      // Told to the app when the ad starts, after its impression.
      expect(ctx.events).not.toContain('loudness:-8.0');
      await ctx.lastAdPlayer().flush();
      expect(ctx.events.slice(ctx.events.indexOf('impression'))).toContain('loudness:-8.0');
    });

    it('never turns a quieter ad up', async () => {
      const ctx = await preRoll('vast/inline-loud.xml', { contentLoudness: -12 });
      expect(ctx.lastAdPlayer().calls).toContain('volume:1');
      expect(ctx.events.filter((e) => e.startsWith('loudness'))).toEqual([]);
    });

    it('plays the ad at full volume when its loudness is unknown', async () => {
      const ctx = await preRoll('vast/inline.xml', { contentLoudness: -24 });
      expect(ctx.lastAdPlayer().calls).toContain('volume:1');
    });

    it('leaves the volume alone without the content loudness', async () => {
      const ctx = await preRoll('vast/inline-loud.xml', {});
      expect(ctx.lastAdPlayer().calls.filter((c) => c.startsWith('volume'))).toEqual([]);
    });
  });

  it('keeps breaks within maxBreakAds and maxBreakSeconds, and tells the ad server the limits', async () => {
    const tag = 'https://ads.test/pod.xml?ads=[BREAKMAXADS]&dur=[BREAKMAXDURATION]';
    const asked = 'https://ads.test/pod.xml?ads=1&dur=60';
    const ctx = setup({ [asked]: fixture('vast/pod-optimized.xml') }, { maxBreakAds: 1, maxBreakSeconds: 60 });
    const starting = ctx.manager.start(manual([{ offset: 'start', vastUrl: tag }]));
    await settle();
    expect(ctx.http.requests).toEqual([asked]);
    ctx.lastAdPlayer().emitCanPlay();
    await starting;
    await settle();
    await ctx.lastAdPlayer().flush();
    expect(ctx.last()).toMatchObject({ position: 1, total: 1 });
    expect(ctx.events).toContain('skipped:budget');
  });

  it('stops a break that would run past maxBreakSeconds', async () => {
    const ctx = setup({ 'https://ads.test/pod.xml': fixture('vast/pod-optimized.xml') }, { maxBreakSeconds: 20 });
    const starting = ctx.manager.start(manual([{ offset: 'start', vastUrl: 'https://ads.test/pod.xml' }]));
    await settle();
    ctx.lastAdPlayer().emitCanPlay();
    await starting;
    await settle();
    const player = ctx.lastAdPlayer();
    await player.flush();
    ctx.clock.advance(10_000);
    player.emitTime(10);
    player.emitEnded();
    await settle();
    // pod-1 is 10 s; pod-2 (15 s) would end at 25 s, past the 20 s limit.
    expect(ctx.events).toContain('skipped:budget');
    expect(ctx.content.calls).toContain('play');
  });

  it('ignores limits that are not positive finite numbers', async () => {
    const tag = 'https://ads.test/pod.xml?ads=[BREAKMAXADS]&dur=[BREAKMAXDURATION]';
    const ctx = setup(
      { [tag]: fixture('vast/pod-optimized.xml') },
      { maxBreakAds: 0, maxBreakSeconds: Number.POSITIVE_INFINITY },
    );
    const starting = ctx.manager.start(manual([{ offset: 'start', vastUrl: tag }]));
    await settle();
    expect(ctx.http.requests).toEqual([tag]); // unknown macros stay as they are
    ctx.lastAdPlayer().emitCanPlay();
    await starting;
    await settle();
    await ctx.lastAdPlayer().flush();
    expect(ctx.last()).toMatchObject({ position: 1, total: 2 });
  });

  describe('pause ads', () => {
    const PAUSE = 'https://ads.test/pause.xml';
    const MID = 'https://ads.test/mid.xml';

    async function started(views: unknown[]) {
      const ctx = setup(
        { [PAUSE]: fixture('vast/pause.xml'), [MID]: fixture('vast/inline.xml') },
        { pauseAdUrl: PAUSE, onPauseAd: (view) => views.push(view) },
      );
      await ctx.manager.start(manual([{ offset: 30, vastUrl: MID }]));
      await ctx.content.flush();
      await settle();
      return ctx;
    }

    it('shows the pause ad when the viewer pauses the content, and hides it when it plays', async () => {
      const views: unknown[] = [];
      const ctx = await started(views);
      ctx.content.emitTime(5);
      ctx.content.emitPause();
      ctx.clock.advance(1_500);
      expect(views).toEqual([expect.objectContaining({ imageUrl: 'https://cdn.test/pause.png' })]);
      expect(ctx.events).toContain('pauseAd:impression');
      await ctx.content.play();
      await ctx.content.flush();
      expect(views[views.length - 1]).toBeNull();
    });

    // "Alexa, pause": Fire TV freezes the picture while Alexa listens, so the pause command finds
    // the player already still and the player sends no pause event (seen on the stick, 12.10.2026).
    it('shows the pause ad on a viewer pause command that brings no pause event', async () => {
      const views: unknown[] = [];
      const ctx = await started(views);
      ctx.content.emitTime(5);
      ctx.manager.viewerPaused();
      ctx.clock.advance(1_500);
      expect(views).toEqual([expect.objectContaining({ imageUrl: 'https://cdn.test/pause.png' })]);
    });

    it('shows no pause ad when the content pauses for a break', async () => {
      const views: unknown[] = [];
      const ctx = await started(views);
      ctx.content.emitTime(15);
      await settle();
      ctx.lastAdPlayer().emitCanPlay();
      await settle();
      ctx.content.emitTime(30);
      await settle();
      await ctx.content.flush(); // the break's pause()
      ctx.clock.advance(1_500);
      expect(ctx.content.paused).toBe(true);
      expect(views).toEqual([]);
    });

    it('lets the app close it with Back, and hides it when the app goes to the background', async () => {
      const views: unknown[] = [];
      const ctx = await started(views);
      expect(ctx.manager.closePauseAd()).toBe(false);
      ctx.content.emitPause();
      ctx.clock.advance(1_500);
      expect(ctx.manager.closePauseAd()).toBe(true);
      expect(ctx.events).toContain('pauseAd:close');
      expect(views[views.length - 1]).toBeNull();

      await ctx.content.play();
      await ctx.content.flush();
      await settle();
      ctx.content.emitPause();
      ctx.clock.advance(1_500);
      expect(views[views.length - 1]).not.toBeNull();
      await ctx.manager.suspend();
      expect(views[views.length - 1]).toBeNull();
    });

    it('shows no pause ad while the pre-roll loads, before the content ever played', async () => {
      const views: unknown[] = [];
      const ctx = setup(
        { [PAUSE]: fixture('vast/pause.xml'), 'https://ads.test/pre.xml': fixture('vast/inline.xml') },
        { pauseAdUrl: PAUSE, onPauseAd: (view) => views.push(view) },
      );
      void ctx.manager.start(manual([{ offset: 'start', vastUrl: 'https://ads.test/pre.xml' }]));
      await settle();
      ctx.content.emitPause();
      ctx.clock.advance(1_500);
      expect(views).toEqual([]);
    });

    it('shows no pause ad in the background, and none after dispose (and takes a shown one away)', async () => {
      const views: unknown[] = [];
      const ctx = await started(views);
      await ctx.manager.suspend();
      ctx.content.emitPause();
      ctx.clock.advance(1_500);
      expect(views).toEqual([]);
      await ctx.manager.wake();
      await ctx.content.play();
      await ctx.content.flush();
      await settle();
      ctx.content.emitPause();
      ctx.clock.advance(1_500);
      expect(views[views.length - 1]).not.toBeNull();
      await ctx.manager.dispose();
      expect(views[views.length - 1]).toBeNull();
    });

    it('shows no pause ad after the content ended', async () => {
      const views: unknown[] = [];
      const ctx = await started(views);
      ctx.content.emitEnded();
      await settle();
      ctx.content.emitPause();
      ctx.clock.advance(1_500);
      expect(views).toEqual([]);
    });
  });

  it('does not show the viewer a creative again in the next break, and reports it', async () => {
    const ctx = await preThenSameMid();
    expect(ctx.content.paused).toBe(false);
    expect(ctx.events).toContain('skipped:repeat');
    expect(ctx.events.filter((e) => e === 'impression')).toHaveLength(1);
  });

  it('shows a repeat when the app turns the rule off, or after the window', async () => {
    const off = await preThenSameMid(false);
    expect(off.content.paused).toBe(true);
    expect(off.events).not.toContain('skipped:repeat');

    const shortWindow = await preThenSameMid({ withinMs: 1 });
    expect(shortWindow.content.paused).toBe(true);

    const longWindow = await preThenSameMid({ withinMs: 60_000 });
    expect(longWindow.content.paused).toBe(false);
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

  it('plays the break a seek jumped over, even when it was not requested before the seek (R24)', async () => {
    const ctx = setup({ 'https://ads.test/mid.xml': fixture('vast/inline.xml') });
    await ctx.manager.start(manual([{ offset: 300, vastUrl: 'https://ads.test/mid.xml' }]));
    ctx.content.emitTime(10);
    await settle();
    expect(ctx.http.requests).toEqual([]);

    ctx.content.emitTime(400); // seek from 0:10 to 6:40, over the break at 5:00
    await settle();
    const ad = ctx.lastAdPlayer();
    ad.emitCanPlay();
    await settle();
    expect(ctx.events.some((e) => e.endsWith(':late'))).toBe(false);
    expect(ad.calls).toContain('play');
    expect(ctx.content.calls).toContain('pause');
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
    expect(ctx.content.calls.slice(-2)).toEqual(['play', 'focus']);
    expect(ctx.content.calls).not.toContain('seek:0');
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

  it('sends the VMAP breakStart and breakEnd pixels of a played break (C2-2)', async () => {
    const pixels = new FakeHttp();
    delete g.Image;
    installImagePolyfill(pixels, g);
    const ctx = setup({ [VMAP]: fixture('vmap/pre-mid-post.xml'), 'https://ads.test/pre.xml': fixture('vast/inline.xml') });
    const starting = ctx.manager.start({ vmapUrl: VMAP });
    await settle();
    ctx.lastAdPlayer().emitCanPlay();
    await starting;
    await settle();
    expect(pixels.requests).toContain('https://t.test/vmap/pre/start');
    expect(pixels.requests).not.toContain('https://t.test/vmap/pre/end');
    await playAdToEnd(ctx);
    expect(pixels.requests).toContain('https://t.test/vmap/pre/end');
  });

  describe('break context', () => {
    it('leaves out ads of a category the break blocks: error 205 to the ad server, skipped:category to the app', async () => {
      const pixels = new FakeHttp();
      delete g.Image;
      installImagePolyfill(pixels, g);
      const ctx = setup({ [VMAP]: fixture('vmap/context.xml'), 'https://ads.test/pod-cat.xml': fixture('vast/pod-cat.xml') });
      const starting = ctx.manager.start({ vmapUrl: VMAP });
      await settle();
      ctx.lastAdPlayer().emitCanPlay();
      await starting;
      await settle();
      expect(ctx.lastAdPlayer().src).toBe('https://cdn.test/coffee.mp4');
      expect(ctx.events).toContain('skipped:category');
      expect(pixels.requests).toContain('https://t.test/err-car?code=205');
      await ctx.lastAdPlayer().flush();
      expect(ctx.last()).toMatchObject({ position: 1, total: 1 });
    });

    it('takes blocked categories for a break given by hand', async () => {
      const ctx = setup({ 'https://ads.test/pod-cat.xml': fixture('vast/pod-cat.xml') });
      const starting = ctx.manager.start({
        breaks: [{ offset: 'start', vastUrl: 'https://ads.test/pod-cat.xml', blockedAdCategories: ['1571'] }],
      });
      await settle();
      ctx.lastAdPlayer().emitCanPlay();
      await starting;
      expect(ctx.lastAdPlayer().src).toBe('https://cdn.test/coffee.mp4');
    });

    it('passes the scene signals on, so the break can say why an ad is missing', async () => {
      const ctx = setup({ 'https://ads.test/pod-cat.xml': fixture('vast/pod-cat.xml') });
      const starting = ctx.manager.start({
        breaks: [{ offset: 'start', vastUrl: 'https://ads.test/pod-cat.xml', blockedAdCategories: ['1571'], sceneSignals: ['vehicle crash'] }],
      });
      await settle();
      ctx.lastAdPlayer().emitCanPlay();
      await starting;
      expect(ctx.last()?.why).toMatchObject({ blockedAfterScene: [null], sceneSignals: ['vehicle crash'] });
    });

    it('plays every ad of a break without context', async () => {
      const ctx = setup({ 'https://ads.test/pod-cat.xml': fixture('vast/pod-cat.xml') });
      const starting = ctx.manager.start(manual([{ offset: 'start', vastUrl: 'https://ads.test/pod-cat.xml' }]));
      await settle();
      ctx.lastAdPlayer().emitCanPlay();
      await starting;
      expect(ctx.lastAdPlayer().src).toBe('https://cdn.test/car.mp4');
      expect(ctx.events).not.toContain('skipped:category');
    });
  });

  it('sends the VMAP error pixel with 1009 when a break has no ads (C2-2)', async () => {
    const pixels = new FakeHttp();
    delete g.Image;
    installImagePolyfill(pixels, g);
    const ctx = setup({ [VMAP]: fixture('vmap/pre-mid-post.xml'), 'https://ads.test/pre.xml': fixture('vast/empty.xml') });
    await ctx.manager.start({ vmapUrl: VMAP });
    await settle();
    expect(pixels.requests).toContain('https://t.test/vmap/pre/error?code=1009');
    expect(pixels.requests).not.toContain('https://t.test/vmap/pre/start');
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

  describe('timeline', () => {
    const lastTimeline = (ctx: Ctx): AdTimeline | undefined => ctx.timelines[ctx.timelines.length - 1];

    it('reports the mid-rolls for the timeline once the schedule is known', async () => {
      const ctx = setup({});
      await ctx.manager.start(
        manual([
          { offset: 'start', vastUrl: 'https://ads.test/none.xml' },
          { offset: 300, vastUrl: 'https://ads.test/mid2.xml' },
          { offset: 30, vastUrl: 'https://ads.test/mid.xml' },
        ]),
      );
      expect(ctx.timelines[0]).toEqual({
        marks: [
          { id: 'break-3', time: 30, done: false },
          { id: 'break-2', time: 300, done: false },
        ],
        nextBreakIn: null,
      });
    });

    it('counts down the last 5 s before a mid-roll whose ads are ready, then marks it played', async () => {
      const ctx = setup({ 'https://ads.test/mid.xml': fixture('vast/inline.xml') });
      await ctx.manager.start(manual([{ offset: 30, vastUrl: 'https://ads.test/mid.xml' }]));
      ctx.content.emitTime(15);
      await settle();
      ctx.lastAdPlayer().emitCanPlay();
      await settle();
      ctx.content.emitTime(24.9);
      await settle();
      expect(lastTimeline(ctx)?.nextBreakIn).toBeNull();
      ctx.content.emitTime(25.2);
      await settle();
      expect(lastTimeline(ctx)?.nextBreakIn).toBe(5);
      ctx.content.emitTime(26.5);
      await settle();
      expect(lastTimeline(ctx)?.nextBreakIn).toBe(4);

      ctx.content.emitTime(30);
      await settle();
      expect(lastTimeline(ctx)).toEqual({ marks: [{ id: 'break-1', time: 30, done: true }], nextBreakIn: null });
    });

    it('does not count down to a break whose ads have not loaded', async () => {
      const ctx = setup({});
      ctx.http.hang('https://ads.test/slow.xml');
      await ctx.manager.start(manual([{ offset: 30, vastUrl: 'https://ads.test/slow.xml' }]));
      ctx.content.emitTime(20);
      await settle();
      ctx.content.emitTime(27);
      await settle();
      expect(ctx.timelines.every((t) => t.nextBreakIn === null)).toBe(true);
    });

    it('reports only changes, not every content time update', async () => {
      const ctx = setup({});
      await ctx.manager.start(manual([{ offset: 300, vastUrl: 'https://ads.test/mid.xml' }]));
      const count = ctx.timelines.length;
      ctx.content.emitTime(10);
      ctx.content.emitTime(10.25);
      ctx.content.emitTime(10.5);
      await settle();
      expect(ctx.timelines).toHaveLength(count);
    });
  });

  describe('preloaded ads (requested before the player exists)', () => {
    const PRE = 'https://ads.test/pre.xml';
    const routes = () => ({ [VMAP]: fixture('vmap/pre-mid-post.xml'), [PRE]: fixture('vast/inline.xml') });

    /** Starts with `preloaded` and lets the pre-roll, if any, become ready. */
    async function startWith(ctx: Ctx, schedule: AdSchedule, preloaded: Promise<PreloadedAds>): Promise<void> {
      const starting = ctx.manager.start(schedule, { preloaded });
      await settle();
      ctx.lastAdPlayer()?.emitCanPlay();
      await starting;
      await settle();
    }

    it('preloadAds() requests the VMAP and the pre-roll VAST, not the later breaks', async () => {
      const ctx = setup(routes());
      const preloaded = await preloadAds({ vmapUrl: VMAP }, { http: ctx.http, clock: ctx.clock });
      expect(ctx.http.requests).toEqual([VMAP, PRE]);
      expect(preloaded.breaks?.map((b) => b.id)).toEqual(['preroll', 'mid-1', 'mid-2', 'postroll']);
      expect(preloaded.preroll?.breakId).toBe('preroll');
      expect(preloaded.preroll?.results.map((r) => r.status)).toEqual(['ok']);
    });

    it('plays the preloaded pre-roll without asking the ad server again', async () => {
      const ctx = setup(routes());
      const preloaded = preloadAds({ vmapUrl: VMAP }, { http: ctx.http, clock: ctx.clock });
      await preloaded;
      ctx.http.requests.length = 0;

      await startWith(ctx, { vmapUrl: VMAP }, preloaded);
      expect(ctx.http.requests).toEqual([]);
      await ctx.lastAdPlayer().flush();
      expect(ctx.last()?.state).toBe('playing');
      await playAdToEnd(ctx);
      expect(ctx.content.calls).toContain('play');
    });

    it('turns a loud preloaded pre-roll down too', async () => {
      const ctx = setup({ [VMAP]: fixture('vmap/pre-mid-post.xml'), [PRE]: fixture('vast/inline-loud.xml') }, { contentLoudness: -24 });
      const preloaded = preloadAds({ vmapUrl: VMAP }, { http: ctx.http, clock: ctx.clock });
      await preloaded;
      await startWith(ctx, { vmapUrl: VMAP }, preloaded);
      expect(ctx.lastAdPlayer().calls).toContain('volume:0.398');
    });

    it('waits for a preload still in flight instead of requesting twice', async () => {
      const ctx = setup(routes());
      let resolve: (value: PreloadedAds) => void = () => undefined;
      const pending = new Promise<PreloadedAds>((r) => (resolve = r));
      const starting = ctx.manager.start({ vmapUrl: VMAP }, { preloaded: pending });
      await settle();
      expect(ctx.http.requests).toEqual([]);
      expect(ctx.content.calls).not.toContain('play');

      resolve(await preloadAds({ vmapUrl: VMAP }, { http: ctx.http, clock: ctx.clock }));
      await settle();
      ctx.lastAdPlayer().emitCanPlay();
      await starting;
      expect(ctx.http.requests).toEqual([VMAP, PRE]);
      await ctx.lastAdPlayer().flush();
      expect(ctx.last()?.state).toBe('playing');
    });

    it('ignores a preload of another schedule', async () => {
      const ctx = setup(routes());
      const other = preloadAds(manual([{ offset: 'start', vastUrl: PRE }]), { http: ctx.http, clock: ctx.clock });
      await other;
      ctx.http.requests.length = 0;
      await startWith(ctx, { vmapUrl: VMAP }, other);
      expect(ctx.http.requests).toEqual([VMAP, PRE]);
    });

    it('ignores a preload older than five minutes: the ads may have expired', async () => {
      const ctx = setup(routes());
      const preloaded = preloadAds({ vmapUrl: VMAP }, { http: ctx.http, clock: ctx.clock });
      await preloaded;
      ctx.http.requests.length = 0;
      ctx.clock.advance(5 * 60 * 1000 + 1);
      await startWith(ctx, { vmapUrl: VMAP }, preloaded);
      expect(ctx.http.requests).toEqual([VMAP, PRE]);
    });

    it('uses a preload exactly five minutes old', async () => {
      const ctx = setup(routes());
      const preloaded = preloadAds({ vmapUrl: VMAP }, { http: ctx.http, clock: ctx.clock });
      await preloaded;
      ctx.http.requests.length = 0;
      ctx.clock.advance(5 * 60 * 1000);
      await startWith(ctx, { vmapUrl: VMAP }, preloaded);
      expect(ctx.http.requests).toEqual([]);
    });

    it('requests again when the preloaded VMAP failed', async () => {
      const ctx = setup({ [PRE]: fixture('vast/inline.xml') });
      const preloaded = preloadAds({ vmapUrl: VMAP }, { http: ctx.http, clock: ctx.clock });
      expect((await preloaded).breaks).toBeNull();
      ctx.http.on(VMAP, { body: fixture('vmap/pre-mid-post.xml') });
      ctx.http.requests.length = 0;
      await startWith(ctx, { vmapUrl: VMAP }, preloaded);
      expect(ctx.http.requests).toEqual([VMAP, PRE]);
      expect(ctx.events).not.toContain('vmap:error:1008');
    });

    it('asks again for a pre-roll whose preloaded request failed', async () => {
      const ctx = setup({ [VMAP]: fixture('vmap/pre-mid-post.xml') });
      ctx.http.fail(PRE);
      const preloaded = preloadAds({ vmapUrl: VMAP }, { http: ctx.http, clock: ctx.clock });
      expect((await preloaded).preroll?.results.map((r) => r.status)).toEqual(['failed']);
      ctx.http.on(PRE, { body: fixture('vast/inline.xml') });
      ctx.http.requests.length = 0;
      await startWith(ctx, { vmapUrl: VMAP }, preloaded);
      expect(ctx.http.requests).toEqual([PRE]);
      await ctx.lastAdPlayer().flush();
      expect(ctx.last()?.state).toBe('playing');
    });

    it('falls back to its own requests when the preload rejects', async () => {
      const ctx = setup(routes());
      await startWith(ctx, { vmapUrl: VMAP }, Promise.reject(new Error('preload failed')));
      expect(ctx.http.requests).toEqual([VMAP, PRE]);
    });

    it('starts the content at once when the preloaded pre-roll has no ads', async () => {
      const ctx = setup({ [PRE]: fixture('vast/empty.xml') });
      const schedule = manual([{ offset: 'start', vastUrl: PRE }]);
      const preloaded = preloadAds(schedule, { http: ctx.http, clock: ctx.clock });
      await preloaded;
      ctx.http.requests.length = 0;
      await ctx.manager.start(schedule, { preloaded });
      await settle();
      expect(ctx.http.requests).toEqual([]);
      expect(ctx.content.calls).toContain('play');
    });

    it('requests the later breaks as usual', async () => {
      const ctx = setup({ 'https://ads.test/mid.xml': fixture('vast/inline.xml') });
      const schedule = manual([{ offset: 30, vastUrl: 'https://ads.test/mid.xml' }]);
      const preloaded = preloadAds(schedule, { http: ctx.http, clock: ctx.clock });
      expect((await preloaded).preroll).toBeNull();
      expect(ctx.http.requests).toEqual([]);
      await ctx.manager.start(schedule, { preloaded });
      ctx.content.emitTime(20);
      await settle();
      expect(ctx.http.requests).toEqual(['https://ads.test/mid.xml']);
    });

    it('a resumed viewing leaves the preload alone: no pre-roll', async () => {
      const ctx = setup(routes());
      const preloaded = preloadAds({ vmapUrl: VMAP }, { http: ctx.http, clock: ctx.clock });
      await preloaded;
      ctx.http.requests.length = 0;
      await ctx.manager.start({ vmapUrl: VMAP }, { resumeAt: 10, preloaded });
      await settle();
      expect(ctx.http.requests).toEqual([VMAP]);
      expect(ctx.adPlayers).toHaveLength(0);
      expect(ctx.content.calls).toContain('play');
    });
  });
});
