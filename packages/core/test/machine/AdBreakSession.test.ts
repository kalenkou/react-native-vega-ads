import { readFileSync } from 'fs';
import { AdBreakSession, SessionSnapshot } from '../../src/machine/AdBreakSession';
import type { AdEventInfo } from '../../src/events';
import { RepeatGuard } from '../../src/pod/RepeatGuard';
import { installImagePolyfill, requestVast } from '../../src/vast';
import { FakeClock } from '../fakes/FakeClock';
import { FakeHttp } from '../fakes/FakeHttp';
import { FakePlayer } from '../fakes/FakePlayer';

const fixture = (name: string): string => readFileSync(`${__dirname}/../../fixtures/vast/${name}`, 'utf8');
const TAG = 'https://ads.test/tag.xml';
const SURFACE = 'ad-surface';
const STANDBY = 'ad-surface-b';

const g = globalThis as Record<string, unknown>;
let pixels: FakeHttp;
beforeEach(() => {
  pixels = new FakeHttp();
  g.window = g;
  delete g.Image;
  installImagePolyfill(pixels, g);
});
afterEach(() => {
  delete g.window;
  delete g.Image;
});

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function setup(
  body: string,
  options: {
    budgetMs?: number;
    maxAds?: number;
    standby?: boolean;
    maxPlayers?: number;
    repeats?: RepeatGuard;
    contentLoudness?: number;
    blockedAdCategories?: string[];
    sceneSignals?: string[];
    content?: FakePlayer;
    holdInit?: (player: FakePlayer) => void;
    captionLanguage?: string;
    handOverLeadMs?: number;
  } = {},
) {
  const http = new FakeHttp().on(TAG, { body });
  const clock = new FakeClock(1_000_000);
  const content = options.content ?? new FakePlayer({ duration: 600 });
  void content.initialize(); // the app's content player is ready before any break
  const adPlayers: FakePlayer[] = [];
  const states: SessionSnapshot[] = [];
  const events: string[] = [];
  const details: Array<[string, AdEventInfo]> = [];
  const session = new AdBreakSession({
    http,
    clock,
    content,
    adSurface: SURFACE,
    standbySurface: options.standby ? STANDBY : undefined,
    createAdPlayer: () => {
      if (options.maxPlayers !== undefined && adPlayers.filter((p) => !p.deinitialized).length >= options.maxPlayers) {
        // Like a device without a free video decoder: the player cannot start.
        const failing = new FakePlayer({ duration: 10 });
        failing.initialize = () => Promise.reject(new Error('no decoder available'));
        adPlayers.push(failing);
        return failing;
      }
      const player = new FakePlayer({ duration: 10 });
      options.holdInit?.(player);
      adPlayers.push(player);
      return player;
    },
    budgetMs: options.budgetMs,
    maxAds: options.maxAds,
    repeats: options.repeats,
    contentLoudness: options.contentLoudness,
    blockedAdCategories: options.blockedAdCategories,
    sceneSignals: options.sceneSignals,
    captionLanguage: options.captionLanguage,
    handOverLeadMs: options.handOverLeadMs,
    onChange: (snapshot) => states.push(snapshot),
    onEvent: (name, info) => {
      events.push(name);
      details.push([name, info]);
    },
  });
  return { session, content, adPlayers, states, events, details, clock, http };
}

/** Loads the break and lets the ad player report it can play. */
async function loadReady(ctx: ReturnType<typeof setup>): Promise<FakePlayer> {
  const loading = ctx.session.load([{ kind: 'url', url: TAG }]);
  await settle();
  const player = ctx.adPlayers[ctx.adPlayers.length - 1] as FakePlayer;
  player.emitCanPlay();
  await expect(loading).resolves.toBe('ready');
  return player;
}

async function contentAt(content: FakePlayer, seconds: number): Promise<void> {
  await content.initialize();
  content.emitTime(seconds);
}

const sent = (): string[] => pixels.requests.splice(0);
const last = (states: SessionSnapshot[]): SessionSnapshot | undefined => states[states.length - 1];
const adsOf = (ctx: ReturnType<typeof setup>, event: string): Array<string | undefined> =>
  ctx.details.filter(([name]) => name === event).map(([, info]) => info.ad?.id);

describe('AdBreakSession: loading (R10)', () => {
  it('prebuffers the chosen file in a fresh ad player without playing it', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await loadReady(ctx);
    expect(player.surface).toBe(SURFACE);
    expect(player.autoplay).toBe(false);
    expect(player.src).toBe('https://cdn.test/ad-720.mp4');
    expect(player.calls).not.toContain('play');
    expect(ctx.session.state).toBe('ready');
  });

  it('reports an empty break without creating a player', async () => {
    const ctx = setup(fixture('empty.xml'));
    await expect(ctx.session.load([{ kind: 'url', url: TAG }])).resolves.toBe('empty');
    expect(ctx.adPlayers).toHaveLength(0);
  });

  it('sends 403 and tries the next ad when no media file is playable', async () => {
    const webmOnly = fixture('inline.xml').replace(/type="video\/mp4"/g, 'type="video/webm"');
    const ctx = setup(webmOnly);
    await expect(ctx.session.load([{ kind: 'url', url: TAG }])).resolves.toBe('empty');
    expect(sent()).toContain('https://t.test/error?code=403');
    expect(ctx.events).toEqual(['error:403']);
    expect(ctx.session.state).toBe('empty');
    expect(last(ctx.states)?.state).toBe('empty');
  });

  it('sends 402 (media file timeout) and gives up on an ad that never becomes playable', async () => {
    const ctx = setup(fixture('inline.xml'));
    const loading = ctx.session.load([{ kind: 'url', url: TAG }]);
    await settle();
    ctx.clock.advance(8000);
    await expect(loading).resolves.toBe('empty');
    expect(sent()).toContain('https://t.test/error?code=402');
    expect(sent()).not.toContain('https://t.test/error?code=400');
    expect(ctx.adPlayers[0]?.deinitialized).toBe(true);
  });
});

describe('AdBreakSession: loading, more cases', () => {
  it('is idle before load()', () => {
    expect(setup(fixture('inline.xml')).session.state).toBe('idle');
  });

  it('plays a preloaded answer without asking the ad server again', async () => {
    const ctx = setup(fixture('inline.xml'));
    const preloaded = await requestVast({ kind: 'url', url: TAG }, { http: ctx.http, clock: ctx.clock });
    ctx.http.requests.length = 0;
    const loading = ctx.session.load([{ kind: 'url', url: TAG }], [preloaded]);
    await settle();
    ctx.adPlayers[0]?.emitCanPlay();
    await expect(loading).resolves.toBe('ready');
    expect(ctx.http.requests).toEqual([]);
  });

  it('asks the ad server again for a source whose preloaded request failed', async () => {
    const ctx = setup(fixture('inline.xml'));
    const down = 'https://ads.test/down.xml';
    const failed = await requestVast({ kind: 'url', url: down }, { http: new FakeHttp().fail(down), clock: ctx.clock });
    expect(failed.status).toBe('failed');
    const loading = ctx.session.load([{ kind: 'url', url: TAG }], [failed]);
    await settle();
    ctx.adPlayers[0]?.emitCanPlay();
    await expect(loading).resolves.toBe('ready');
    expect(ctx.http.requests).toEqual([TAG]);
  });

  it('loads nothing when the break is left while the ad server answers', async () => {
    const ctx = setup(fixture('inline.xml'));
    let answer = (): void => undefined;
    const get = ctx.http.get.bind(ctx.http);
    ctx.http.get = (url, options) => new Promise((resolve) => (answer = () => resolve(get(url, options))));
    const loading = ctx.session.load([{ kind: 'url', url: TAG }]);
    await settle();
    await ctx.session.interrupt();
    answer();
    await expect(loading).resolves.toBe('empty');
    expect(ctx.adPlayers).toHaveLength(0);
    expect(ctx.session.state).toBe('interrupted');
  });

  it('loads nothing when the break is left while the viewing history is read', async () => {
    let restore = (): void => undefined;
    const memory = {
      read: () => new Promise<string | null>((resolve) => (restore = () => resolve(null))),
      write: () => Promise.resolve(),
    };
    const ctx = setup(fixture('inline.xml'), { repeats: new RepeatGuard(new FakeClock(0), { memory }) });
    const loading = ctx.session.load([{ kind: 'url', url: TAG }]);
    await settle();
    await ctx.session.interrupt();
    restore();
    await expect(loading).resolves.toBe('empty');
    expect(ctx.adPlayers).toHaveLength(0);
    expect(ctx.session.state).toBe('interrupted');
  });

  it('loads nothing when the break is left just after its ad became playable', async () => {
    const ctx = setup(fixture('inline.xml'));
    const loading = ctx.session.load([{ kind: 'url', url: TAG }]);
    await settle();
    const player = ctx.adPlayers[0] as FakePlayer;
    player.emitCanPlay();
    const interrupted = ctx.session.interrupt();
    await expect(loading).resolves.toBe('empty');
    await interrupted;
    expect(ctx.session.state).toBe('interrupted');
    expect(player.deinitialized).toBe(true);
  });

  it('plays only the first ad of a source that allows one ad', async () => {
    const ctx = setup(fixture('pod-optimized.xml'));
    const loading = ctx.session.load([{ kind: 'url', url: TAG }], [], [true]);
    await settle();
    const player = ctx.adPlayers[0] as FakePlayer;
    player.emitCanPlay();
    await expect(loading).resolves.toBe('ready');
    expect(player.src).toBe('https://cdn.test/pod-1.mp4');
    await ctx.session.start();
    expect(last(ctx.states)).toMatchObject({ position: 1, total: 1 });
  });

  it('reports an empty break for an empty source that allows one ad', async () => {
    const ctx = setup(fixture('empty.xml'));
    await expect(ctx.session.load([{ kind: 'url', url: TAG }], [], [true])).resolves.toBe('empty');
  });
});

describe('AdBreakSession: playing (R1, R2, R11, R12, R21)', () => {
  it('pauses content, plays the ad, moves media controls to it and tracks the impression on the first frame', async () => {
    const ctx = setup(fixture('inline.xml'));
    await contentAt(ctx.content, 42.5);
    const player = await loadReady(ctx);
    sent();
    await ctx.session.start();
    expect(ctx.content.calls).toContain('pause');
    expect(player.calls).toContain('play');
    expect(sent().filter((u) => u.includes('/impression'))).toEqual([]);
    await player.flush();
    expect(sent().filter((u) => u.includes('/impression'))).toHaveLength(2);
    ctx.clock.advance(0);
    expect(player.hasMediaControlFocus).toBe(true);
    expect(ctx.session.state).toBe('playing');
    expect(last(ctx.states)).toMatchObject({ state: 'playing', position: 1, total: 1 });
  });

  // On a cold start setMediaControlFocus blocks the JS thread for 1-2 s on the device,
  // which held back the `playing` event and so the impression and start pixels.
  it('takes media control focus only after the first frame is tracked, once per ad', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await loadReady(ctx);
    sent();
    await ctx.session.start();
    await settle();
    expect(player.calls).not.toContain('focus');
    await player.flush();
    expect(player.calls).not.toContain('focus');
    ctx.clock.advance(0);
    expect(player.calls.filter((call) => call === 'focus')).toHaveLength(1);
    expect(ctx.session.togglePause()).toBe(true);
    expect(ctx.session.togglePause()).toBe(true);
    await player.flush();
    ctx.clock.advance(0);
    expect(player.calls.filter((call) => call === 'focus')).toHaveLength(1);
  });

  it('tracks quartiles and shows progress', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    sent();
    player.emitTime(2.6);
    expect(sent()).toEqual(['https://t.test/start', 'https://t.test/q1']);
    expect(last(ctx.states)).toMatchObject({ adTime: 2.6, adDuration: 10 });
  });

  it('returns to the saved content position, gives media controls back and releases the ad player', async () => {
    const ctx = setup(fixture('inline.xml'));
    await contentAt(ctx.content, 42.5);
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    ctx.content.emitTime(43.9); // late time update from the paused content player
    player.emitEnded();
    await settle();
    expect(sent()).toContain('https://t.test/complete');
    expect(ctx.content.calls.slice(-3)).toEqual(['seek:42.5', 'play', 'focus']);
    expect(player.deinitialized).toBe(true);
    expect(ctx.session.state).toBe('finished');
    expect(ctx.events).toEqual(['impression', 'complete', 'breakEnd']);
  });

  it('pauses and resumes the ad with pixels', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    sent();
    player.pause();
    await player.flush();
    await player.play();
    await player.flush();
    expect(sent()).toEqual(['https://t.test/pause', 'https://t.test/resume']);
  });
});

describe('AdBreakSession: pods (R17)', () => {
  it('plays the pod in sequence order, one after another', async () => {
    const ctx = setup(fixture('pod-optimized.xml'));
    const player = await loadReady(ctx);
    expect(player.src).toBe('https://cdn.test/pod-1.mp4');
    await ctx.session.start();
    await player.flush();
    player.emitEnded();
    await settle();
    expect(player.src).toBe('https://cdn.test/pod-2.mp4');
    expect(last(ctx.states)).toMatchObject({ position: 2, total: 2 });
    await player.flush();
    player.emitEnded();
    await settle();
    expect(ctx.session.state).toBe('finished');
  });

  it('replaces a failing pod ad with the buffet ad (R7)', async () => {
    const ctx = setup(fixture('pod-optimized.xml'));
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    player.emitError();
    await settle();
    expect(player.src).toBe('https://cdn.test/buffet.mp4');
    expect(last(ctx.states)).toMatchObject({ position: 1, total: 2 });
    expect(ctx.events).toContain('error:405');
  });

  it('leaves out an ad the viewer saw in an earlier break and tells the ad server it was not used', async () => {
    const repeats = new RepeatGuard(new FakeClock(0));
    const earlier = setup(fixture('pod-optimized.xml'), { repeats });
    const first = await loadReady(earlier);
    await earlier.session.start();
    await first.flush(); // pod-1 shows its first frame

    const withNotUsed = fixture('pod-optimized.xml').replace(
      '<Duration>00:00:10</Duration>',
      '<Duration>00:00:10</Duration><TrackingEvents><Tracking event="notUsed"><![CDATA[https://t.test/notused-pod-1]]></Tracking></TrackingEvents>',
    );
    const ctx = setup(withNotUsed, { repeats });
    sent();
    const player = await loadReady(ctx);
    expect(player.src).toBe('https://cdn.test/pod-2.mp4');
    expect(sent()).toContain('https://t.test/notused-pod-1');
    expect(ctx.events).toEqual(expect.arrayContaining(['notUsed', 'skipped:repeat']));
    await ctx.session.start();
    expect(last(ctx.states)).toMatchObject({ position: 1, total: 1 });
  });

  it('remembers only ads that showed a frame', async () => {
    const repeats = new RepeatGuard(new FakeClock(0));
    const earlier = setup(fixture('pod-optimized.xml'), { repeats });
    await loadReady(earlier); // prebuffered, never shown
    const ctx = setup(fixture('pod-optimized.xml'), { repeats });
    const player = await loadReady(ctx);
    expect(player.src).toBe('https://cdn.test/pod-1.mp4');
  });

  it('plays at most maxAds ads and tells the ad server the rest were not used', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { maxAds: 1 });
    const player = await loadReady(ctx);
    expect(ctx.events).toEqual(expect.arrayContaining(['notUsed', 'skipped:budget']));
    await ctx.session.start();
    expect(last(ctx.states)).toMatchObject({ position: 1, total: 1 });
    await player.flush();
    player.emitEnded();
    await settle();
    expect(ctx.session.state).toBe('finished');
  });

  it('stops the pod when the next ad would pass the break budget', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { budgetMs: 20_000 });
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    ctx.clock.advance(9_000);
    player.emitTime(9);
    ctx.clock.advance(1_000);
    player.emitTime(10);
    player.emitEnded();
    await settle();
    expect(ctx.session.state).toBe('finished');
    expect(ctx.events).toEqual(expect.arrayContaining(['notUsed', 'skipped:budget']));
  });
});

describe('AdBreakSession: viewer actions (R8, R13, R23)', () => {
  it('skips only after the skip offset', async () => {
    const ctx = setup(fixture('pod-optimized.xml'));
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    player.emitTime(4);
    expect(ctx.session.skip()).toBe(false);
    expect(last(ctx.states)).toMatchObject({ canSkip: false, skipIn: 1 });
    player.emitTime(5);
    expect(last(ctx.states)).toMatchObject({ canSkip: true, skipIn: 0 });
    expect(ctx.session.skip()).toBe(true);
    await settle();
    expect(player.src).toBe('https://cdn.test/pod-2.mp4');
  });

  it('does not seek the content when it did not move during the break (a pre-roll at 0)', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    player.emitEnded();
    await settle();
    expect(ctx.content.calls.filter((c) => c.startsWith('seek'))).toEqual([]);
    expect(ctx.content.calls.slice(-2)).toEqual(['play', 'focus']);
  });

  it('seeks back only when the content moved more than a quarter second after pause()', async () => {
    const ctx = setup(fixture('inline.xml'));
    await contentAt(ctx.content, 42.5);
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    ctx.content.emitTime(42.75); // a late update, within the tolerance
    player.emitEnded();
    await settle();
    expect(ctx.content.calls.filter((c) => c.startsWith('seek'))).toEqual([]);

    const moved = setup(fixture('inline.xml'));
    await contentAt(moved.content, 42.5);
    const second = await loadReady(moved);
    await moved.session.start();
    await second.flush();
    moved.content.emitTime(42.76);
    second.emitEnded();
    await settle();
    expect(moved.content.calls.slice(-3)).toEqual(['seek:42.5', 'play', 'focus']);
  });

  it('on Back, releases the ad and returns to content without skip or close pixels', async () => {
    const ctx = setup(fixture('inline.xml'));
    await contentAt(ctx.content, 12);
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    sent();
    await ctx.session.cancel();
    expect(sent()).toEqual([]);
    expect(player.deinitialized).toBe(true);
    expect(ctx.content.calls.slice(-2)).toEqual(['play', 'focus']);
    expect(ctx.content.calls).not.toContain('seek:12');
    expect(ctx.session.state).toBe('finished');
  });

  it('when the app goes to the background, releases the ad player and resumes content later (R13)', async () => {
    const ctx = setup(fixture('inline.xml'));
    await contentAt(ctx.content, 30);
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    const result = await ctx.session.interrupt();
    expect(result).toEqual({ impressed: true });
    expect(player.deinitialized).toBe(true);
    expect(ctx.session.state).toBe('interrupted');
    await ctx.session.resumeContent();
    expect(ctx.content.calls.filter((c) => c.startsWith('seek'))).toEqual([]);
    expect(ctx.content.calls.slice(-2)).toEqual(['play', 'focus']);
    expect(ctx.session.state).toBe('finished');
  });

  it('ignores start before the break is ready', async () => {
    const ctx = setup(fixture('inline.xml'));
    await expect(ctx.session.start()).rejects.toThrow('not ready');
  });
});

describe('AdBreakSession: viewer actions, more cases', () => {
  it('refuses a second start()', async () => {
    const ctx = setup(fixture('inline.xml'));
    await loadReady(ctx);
    await ctx.session.start();
    await expect(ctx.session.start()).rejects.toThrow('not ready');
  });

  it('allows no Skip after the break was left', async () => {
    const ctx = setup(fixture('pod-optimized.xml'));
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    player.emitTime(6);
    await ctx.session.interrupt();
    expect(ctx.session.skip()).toBe(false);
    expect(ctx.events).not.toContain('skip');
  });

  it('pauses on the first press even before the ad shows a frame', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await loadReady(ctx);
    await ctx.session.start();
    player.calls.length = 0;
    expect(ctx.session.togglePause()).toBe(true);
    expect(player.calls).toEqual(['pause']);
  });

  it('goes through resuming to finished on Back', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    const from = ctx.states.length;
    await ctx.session.cancel();
    expect(ctx.states.slice(from).map((s) => s.state)).toEqual(['resuming', 'resuming', 'finished']);
  });

  it('after a post-roll gives media controls back but does not play the content again', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await loadReady(ctx);
    await ctx.session.start({ resumeContent: false });
    await player.flush();
    ctx.content.calls.length = 0;
    player.emitEnded();
    await settle();
    expect(ctx.content.calls).toEqual(['focus']);
    expect(ctx.session.state).toBe('finished');
  });

  it('reports no impression for a break left before its first frame', async () => {
    const ctx = setup(fixture('inline.xml'));
    await loadReady(ctx);
    await ctx.session.start();
    await expect(ctx.session.interrupt()).resolves.toEqual({ impressed: false });
  });

  it('plays the content when it comes back from a break left before it started', async () => {
    const ctx = setup(fixture('inline.xml'));
    await loadReady(ctx);
    await ctx.session.interrupt();
    await ctx.session.resumeContent();
    expect(ctx.content.calls.slice(-2)).toEqual(['play', 'focus']);
  });

  it('plays the next ad of the pod on the same player at once', async () => {
    const ctx = setup(fixture('pod-optimized.xml'));
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    player.emitEnded();
    await settle();
    expect(player.src).toBe('https://cdn.test/pod-2.mp4');
    expect(player.autoplay).toBe(true);
  });
});

describe('AdBreakSession: back-to-back ads on two ad players', () => {
  async function playFirst(ctx: ReturnType<typeof setup>): Promise<FakePlayer> {
    const first = await loadReady(ctx);
    await ctx.session.start();
    await first.flush();
    await settle();
    return first;
  }

  it('prebuffers the next pod ad on the standby surface while the current ad plays', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { standby: true });
    await playFirst(ctx);
    const next = ctx.adPlayers[1] as FakePlayer;
    expect(next.surface).toBe(STANDBY);
    expect(next.autoplay).toBe(false);
    expect(next.src).toBe('https://cdn.test/pod-2.mp4');
    expect(next.calls).not.toContain('play');
  });

  it('switches to the prebuffered player when the current ad ends', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { standby: true });
    const first = await playFirst(ctx);
    const next = ctx.adPlayers[1] as FakePlayer;
    next.emitCanPlay();
    await settle();
    first.emitEnded();
    await settle();
    expect(next.calls).toContain('play');
    expect(first.calls.filter((c) => c.startsWith('src:'))).toHaveLength(1);
    expect(first.deinitialized).toBe(true);
    await next.flush();
    await settle();
    expect(last(ctx.states)).toMatchObject({ position: 2, total: 2, adSurface: STANDBY });
    expect(pixels.requests).toContain('https://t.test/imp-pod-2');
    ctx.clock.advance(0);
    expect(next.hasMediaControlFocus).toBe(true);
  });

  it('names the file that plays in [ASSETURI], also for the prebuffered ad', async () => {
    const xml = fixture('pod-optimized.xml')
      .replace('https://t.test/imp-pod-1', 'https://t.test/imp-pod-1?asset=[ASSETURI]')
      .replace('https://t.test/imp-pod-2', 'https://t.test/imp-pod-2?asset=[ASSETURI]')
      .replace(
        /(<MediaFile [^>]*><!\[CDATA\[https:\/\/cdn\.test\/pod-(\d)\.mp4)/g,
        '<MediaFile delivery="progressive" type="video/mp4" width="640" height="360" bitrate="800"><![CDATA[https://cdn.test/pod-$2-360.mp4]]></MediaFile>$1',
      );
    const ctx = setup(xml, { standby: true });
    const first = await playFirst(ctx);
    const next = ctx.adPlayers[1] as FakePlayer;
    next.emitCanPlay();
    await settle();
    first.emitEnded();
    await settle();
    await next.flush();
    await settle();
    const asset = (url: string): string => `?asset=${encodeURIComponent(url)}`;
    expect(pixels.requests).toContain(`https://t.test/imp-pod-1${asset('https://cdn.test/pod-1.mp4')}`);
    expect(pixels.requests).toContain(`https://t.test/imp-pod-2${asset('https://cdn.test/pod-2.mp4')}`);
  });

  it('starts the next ad just before the current one ends, so its first frame covers the end (no content frame between ads)', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { standby: true });
    const first = await playFirst(ctx);
    const next = ctx.adPlayers[1] as FakePlayer;
    next.emitCanPlay();
    await settle();
    first.emitTime(9.4);
    await settle();
    expect(next.calls).not.toContain('play');
    first.emitTime(9.6);
    await settle();
    expect(next.calls).toContain('play');
    expect(first.deinitialized).toBe(false);
    // One sound at a time (Fire TV audio focus test): the finishing ad is silenced.
    expect(first.muted).toBe(true);
    expect(next.muted).toBe(false);
    // The standby surface is above the first one: show it as soon as the next ad starts.
    expect(last(ctx.states)).toMatchObject({ adSurface: STANDBY });
    await next.flush();
    await settle();
    expect(last(ctx.states)).toMatchObject({ position: 2, adSurface: STANDBY });
    ctx.clock.advance(0);
    expect(next.hasMediaControlFocus).toBe(true);
    expect(ctx.events.filter((e) => e === 'complete')).toHaveLength(0);
    first.emitEnded();
    await settle();
    expect(ctx.events.filter((e) => e === 'complete')).toHaveLength(1);
    expect(first.deinitialized).toBe(true);
    expect(ctx.session.state).toBe('playing');
  });

  it('prebuffers the third ad on the first surface only after the first ad player is released', async () => {
    const ctx = setup(fixture('pod-optimized.xml').replace('<Ad id="buffet">', '<Ad id="pod-3" sequence="3">'), {
      standby: true,
    });
    const first = await playFirst(ctx);
    const second = ctx.adPlayers[1] as FakePlayer;
    second.emitCanPlay();
    await settle();
    first.emitTime(9.6);
    await settle();
    await second.flush();
    await settle();
    expect(ctx.adPlayers).toHaveLength(2);
    first.emitEnded();
    await settle();
    const third = ctx.adPlayers[2] as FakePlayer;
    expect(third.surface).toBe(SURFACE);
    expect(third.src).toBe('https://cdn.test/buffet.mp4');
  });

  it('keeps prebuffering when a finished ad player fails to release', async () => {
    const ctx = setup(fixture('pod-optimized.xml').replace('<Ad id="buffet">', '<Ad id="pod-3" sequence="3">'), {
      standby: true,
    });
    const first = await playFirst(ctx);
    first.deinitialize = () => Promise.reject(new Error('already gone'));
    const second = ctx.adPlayers[1] as FakePlayer;
    second.emitCanPlay();
    await settle();
    first.emitTime(9.6);
    await settle();
    await second.flush();
    first.emitEnded();
    await settle();
    const third = ctx.adPlayers[2] as FakePlayer;
    expect(third?.surface).toBe(SURFACE);
  });

  it('when the next ad is on the lower surface, keeps the upper one shown until its ad ends', async () => {
    const ctx = setup(fixture('pod-optimized.xml').replace('<Ad id="buffet">', '<Ad id="pod-3" sequence="3">'), {
      standby: true,
    });
    const first = await playFirst(ctx);
    const second = ctx.adPlayers[1] as FakePlayer;
    second.emitCanPlay();
    await settle();
    first.emitTime(9.6);
    await settle();
    await second.flush();
    first.emitEnded();
    await settle();
    const third = ctx.adPlayers[2] as FakePlayer;
    third.emitCanPlay();
    await settle();
    second.emitTime(14.6);
    await settle();
    expect(third.calls).toContain('play');
    expect(last(ctx.states)).toMatchObject({ position: 3, adSurface: STANDBY });
    pixels.requests.splice(0);
    await third.flush();
    await settle();
    third.emitTime(0.4);
    expect(last(ctx.states)).toMatchObject({ adSurface: STANDBY });
    // The third ad plays under the second one, so it is not visible yet: no impression, no start.
    expect(pixels.requests.filter((u) => u.includes('imp-buffet'))).toEqual([]);
    expect(ctx.events.filter((e) => e === 'impression')).toHaveLength(2);
    second.emitEnded();
    await settle();
    expect(last(ctx.states)).toMatchObject({ position: 3, adSurface: SURFACE });
    expect(pixels.requests).toContain('https://t.test/imp-buffet');
  });

  it('falls back to the current player when the next ad is not buffered in time', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { standby: true });
    const first = await playFirst(ctx);
    const next = ctx.adPlayers[1] as FakePlayer;
    first.emitEnded();
    await settle();
    expect(next.deinitialized).toBe(true);
    expect(first.src).toBe('https://cdn.test/pod-2.mp4');
    expect(last(ctx.states)).toMatchObject({ position: 2, adSurface: SURFACE });
  });

  it('drops the prebuffered ad when the current one fails and plays the buffet ad instead', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { standby: true });
    const first = await playFirst(ctx);
    const next = ctx.adPlayers[1] as FakePlayer;
    next.emitCanPlay();
    first.emitError();
    await settle();
    expect(next.deinitialized).toBe(true);
    expect(first.src).toBe('https://cdn.test/buffet.mp4');
  });

  it('releases both ad players when the break ends', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { standby: true });
    const first = await playFirst(ctx);
    const next = ctx.adPlayers[1] as FakePlayer;
    next.emitCanPlay();
    await settle();
    first.emitEnded();
    await settle();
    await next.flush();
    next.emitEnded();
    await settle();
    expect(ctx.session.state).toBe('finished');
    expect(ctx.adPlayers.every((p) => p.deinitialized)).toBe(true);
  });

  it('keeps playing with one ad player when the device cannot create a second one', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { standby: true, maxPlayers: 1 });
    const first = await playFirst(ctx);
    expect(ctx.adPlayers).toHaveLength(2);
    first.emitTime(9.6);
    first.emitEnded();
    await settle();
    expect(first.src).toBe('https://cdn.test/pod-2.mp4');
    expect(last(ctx.states)).toMatchObject({ state: 'playing', position: 2, adSurface: SURFACE });
    expect(ctx.events).toContain('standby:unavailable');
    await first.flush();
    first.emitEnded();
    await settle();
    expect(ctx.session.state).toBe('finished');
  });

  it('does not prebuffer anything for the last ad of the break', async () => {
    const ctx = setup(fixture('inline.xml'), { standby: true });
    await playFirst(ctx);
    expect(ctx.adPlayers).toHaveLength(1);
  });
});

describe('AdBreakSession: back-to-back ads, more cases', () => {
  const POD3 = (): string => fixture('pod-optimized.xml').replace('<Ad id="buffet">', '<Ad id="pod-3" sequence="3">');
  const NO_FILE_FOR_POD2 = (): string =>
    fixture('pod-optimized.xml').replace(
      /type="video\/mp4"([^>]*><!\[CDATA\[https:\/\/cdn\.test\/pod-2)/,
      'type="video/webm"$1',
    );

  async function playFirst(ctx: ReturnType<typeof setup>): Promise<FakePlayer> {
    const first = await loadReady(ctx);
    await ctx.session.start();
    await first.flush();
    await settle();
    return first;
  }

  /** Plays the first ad and hands over to the prebuffered second one at 9.6 s. */
  async function handOver(ctx: ReturnType<typeof setup>): Promise<[FakePlayer, FakePlayer]> {
    const first = await playFirst(ctx);
    const second = ctx.adPlayers[1] as FakePlayer;
    second.emitCanPlay();
    await settle();
    first.emitTime(9.6);
    await settle();
    await second.flush();
    await settle();
    return [first, second];
  }

  it('an error of the new ad during the hand-over fails only the new ad', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { standby: true });
    const [first, second] = await handOver(ctx);
    second.emitError();
    await settle();
    expect(adsOf(ctx, 'error:405')).toEqual(['pod-2']);
    expect(first.deinitialized).toBe(false);
  });

  it('the finishing ad still reports its quartiles after an early hand-over', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { standby: true, handOverLeadMs: 3000 });
    const first = await playFirst(ctx);
    const second = ctx.adPlayers[1] as FakePlayer;
    second.emitCanPlay();
    await settle();
    first.emitTime(7.1);
    await settle();
    expect(second.calls).toContain('play');
    expect(adsOf(ctx, 'thirdQuartile')).toEqual([]);
    first.emitTime(7.6);
    expect(adsOf(ctx, 'thirdQuartile')).toEqual(['pod-1']);
  });

  it('releases a finishing ad that never ends one second after its planned end', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { standby: true });
    const [first] = await handOver(ctx);
    ctx.clock.advance(1_300);
    await settle();
    expect(first.deinitialized).toBe(false);
    ctx.clock.advance(200);
    await settle();
    expect(first.deinitialized).toBe(true);
    expect(adsOf(ctx, 'complete')).toEqual(['pod-1']);
  });

  it('tries the second ad player only once when the device cannot create it', async () => {
    const ctx = setup(POD3(), { standby: true, maxPlayers: 1 });
    const first = await playFirst(ctx);
    first.emitEnded();
    await settle();
    await first.flush();
    await settle();
    expect(first.src).toBe('https://cdn.test/pod-2.mp4');
    expect(ctx.adPlayers).toHaveLength(2);
    expect(ctx.events.filter((e) => e === 'standby:unavailable')).toHaveLength(1);
  });

  it('prebuffers no next ad that would pass the break budget', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { standby: true, budgetMs: 20_000 });
    await playFirst(ctx);
    expect(ctx.adPlayers).toHaveLength(1);
  });

  it('counts only the rest of the current ad when it checks the budget for the next one', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { standby: true, budgetMs: 22_000 });
    const first = await loadReady(ctx);
    await ctx.session.start();
    first.emitTime(4); // the first frame comes at 4 s: 6 s of the ad are left
    await first.flush();
    await settle();
    expect(ctx.adPlayers).toHaveLength(2);
  });

  it('prebuffers nothing for a next ad without a playable file, and then plays the spare ad', async () => {
    const ctx = setup(NO_FILE_FOR_POD2(), { standby: true });
    const first = await playFirst(ctx);
    expect(ctx.adPlayers).toHaveLength(1);
    first.emitEnded();
    await settle();
    expect(adsOf(ctx, 'error:403')).toEqual(['pod-2']);
    expect(first.src).toBe('https://cdn.test/buffet.mp4');
  });

  it('prebuffers nothing when the ad changed while the finishing ad was still on screen', async () => {
    const ctx = setup(POD3(), { standby: true });
    const [first, second] = await handOver(ctx);
    second.emitError();
    await settle();
    expect(second.src).toBe('https://cdn.test/buffet.mp4');
    first.emitEnded();
    await settle();
    expect(ctx.adPlayers).toHaveLength(2);
  });

  it.each([
    ['the ad is skipped', (ctx: ReturnType<typeof setup>) => void ctx.session.skip()],
    ['the break is left', (ctx: ReturnType<typeof setup>) => void ctx.session.interrupt()],
  ])('releases a second ad player that finishes starting after %s', async (_name, leave) => {
    let started = (): void => undefined;
    let created = 0;
    const ctx = setup(fixture('pod-optimized.xml'), {
      standby: true,
      holdInit: (player) => {
        if (created++ === 1) {
          player.initialize = async () => {
            await new Promise<void>((resolve) => (started = resolve));
            await FakePlayer.prototype.initialize.call(player);
          };
        }
      },
    });
    const first = await playFirst(ctx);
    first.emitTime(5);
    leave(ctx);
    await settle();
    started();
    await settle();
    const second = ctx.adPlayers[1] as FakePlayer;
    expect(second.src).toBeNull();
    expect(second.deinitialized).toBe(true);
  });

  it('an error of the ad that came from the second player fails that ad, not a standby', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { standby: true });
    const first = await playFirst(ctx);
    const next = ctx.adPlayers[1] as FakePlayer;
    next.emitCanPlay();
    first.emitEnded();
    await settle();
    await next.flush();
    next.emitError();
    await settle();
    expect(ctx.events).not.toContain('standby:error');
    expect(adsOf(ctx, 'error:405')).toEqual(['pod-2']);
  });

  it('tells the app when a second ad player breaks', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { standby: true });
    await playFirst(ctx);
    (ctx.adPlayers[1] as FakePlayer).emitError();
    await settle();
    expect(ctx.events).toContain('standby:error');
  });

  it('hands over at the VAST duration, not at the length the player reports', async () => {
    const ctx = setup(POD3(), { standby: true });
    const [first, second] = await handOver(ctx);
    first.emitEnded();
    await settle();
    const third = ctx.adPlayers[2] as FakePlayer;
    third.emitCanPlay();
    await settle();
    second.emitTime(9.6); // the player says 10 s; the VAST says 15 s
    await settle();
    expect(third.calls).not.toContain('play');
    second.emitTime(14.6);
    await settle();
    expect(third.calls).toContain('play');
  });

  it('tracks an ad that starts under the finishing one from where it is when it shows', async () => {
    const ctx = setup(POD3(), { standby: true });
    const [first, second] = await handOver(ctx);
    first.emitEnded();
    await settle();
    const third = ctx.adPlayers[2] as FakePlayer;
    third.emitCanPlay();
    await settle();
    second.emitTime(14.6);
    await settle();
    await third.flush();
    third.emitTime(2);
    expect(adsOf(ctx, 'start')).not.toContain('pod-3');
    second.emitEnded();
    await settle();
    expect(adsOf(ctx, 'impression')).toContain('pod-3');
    expect(adsOf(ctx, 'firstQuartile')).toContain('pod-3');
    third.emitTime(3.1);
    expect(adsOf(ctx, 'midpoint')).toContain('pod-3');
  });

  it('hands over exactly at the lead time, and not to a next ad that is not buffered yet', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { standby: true });
    const first = await playFirst(ctx);
    const next = ctx.adPlayers[1] as FakePlayer;
    first.emitTime(9.6);
    await settle();
    expect(next.calls).not.toContain('play');

    const exact = setup(fixture('pod-optimized.xml'), { standby: true });
    const one = await playFirst(exact);
    const two = exact.adPlayers[1] as FakePlayer;
    two.emitCanPlay();
    one.emitTime(9.5);
    await settle();
    expect(two.calls).toContain('play');
  });

  it('does not hand over early when neither the VAST nor the player knows the ad length', async () => {
    const noDuration = fixture('pod-optimized.xml').replace(
      '<Linear skipoffset="00:00:05"><Duration>00:00:10</Duration>',
      '<Linear skipoffset="00:00:05">',
    );
    const ctx = setup(noDuration, { standby: true, holdInit: (player) => (player.getDuration = () => 0) });
    const first = await playFirst(ctx);
    const next = ctx.adPlayers[1] as FakePlayer;
    next.emitCanPlay();
    first.emitTime(1);
    await settle();
    expect(next.calls).not.toContain('play');
  });

  it('hands over to the next ad only while it still fits the break budget', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { standby: true, budgetMs: 30_000 });
    const first = await playFirst(ctx);
    const next = ctx.adPlayers[1] as FakePlayer;
    next.emitCanPlay();
    ctx.clock.advance(9_600);
    first.emitTime(9.6);
    await settle();
    expect(next.calls).toContain('play');

    const late = setup(fixture('pod-optimized.xml'), { standby: true, budgetMs: 27_500 });
    const slow = await playFirst(late);
    const unused = late.adPlayers[1] as FakePlayer;
    unused.emitCanPlay();
    late.clock.advance(12_600); // the ad stopped for 3 s on the way
    slow.emitTime(9.6);
    await settle();
    expect(unused.calls).not.toContain('play');
  });

  it('plays the next ad on the same player while it fits the break budget', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { budgetMs: 30_000 });
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    ctx.clock.advance(10_000);
    player.emitTime(10);
    player.emitEnded();
    await settle();
    expect(player.src).toBe('https://cdn.test/pod-2.mp4');
  });

  it('on Back, releases the prebuffered player too and detaches both surfaces', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { standby: true });
    const first = await playFirst(ctx);
    const next = ctx.adPlayers[1] as FakePlayer;
    next.emitCanPlay();
    await ctx.session.cancel();
    expect([first.deinitialized, next.deinitialized]).toEqual([true, true]);
    expect([first.surface, next.surface]).toEqual([null, null]);
  });

  it('gives media controls to an ad only while it is still the one on screen', async () => {
    const ctx = setup(fixture('pod-optimized.xml'));
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    player.emitEnded();
    await settle();
    ctx.clock.advance(0);
    expect(player.calls).not.toContain('focus');
    await player.flush();
    ctx.clock.advance(0);
    expect(player.calls.filter((c) => c === 'focus')).toHaveLength(1);

    const left = setup(fixture('inline.xml'));
    const gone = await loadReady(left);
    await left.session.start();
    await gone.flush();
    await left.session.cancel();
    left.clock.advance(0);
    expect(gone.calls).not.toContain('focus');
  });

  it('ignores an error of a skipped ad while the unused second player is released', async () => {
    let release = (): void => undefined;
    let created = 0;
    const ctx = setup(fixture('pod-optimized.xml'), {
      standby: true,
      holdInit: (player) => {
        if (created++ === 1) {
          player.deinitialize = () => new Promise<void>((resolve) => (release = resolve));
        }
      },
    });
    const first = await playFirst(ctx);
    first.emitTime(5);
    expect(ctx.session.skip()).toBe(true);
    await settle();
    first.emitError();
    release();
    await settle();
    expect(ctx.events).not.toContain('error:405');
    expect(first.src).toBe('https://cdn.test/pod-2.mp4');
  });
});

describe('AdBreakSession: remote play/pause from the app key handler', () => {
  it('pauses and resumes the ad on togglePause, with pixels', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    sent();
    expect(ctx.session.togglePause()).toBe(true);
    await player.flush();
    expect(player.paused).toBe(true);
    expect(ctx.session.togglePause()).toBe(true);
    await player.flush();
    expect(player.paused).toBe(false);
    expect(ctx.session.togglePause()).toBe(true);
    await player.flush();
    expect(player.paused).toBe(true);
    expect(sent()).toEqual(['https://t.test/pause', 'https://t.test/resume', 'https://t.test/pause']);
    expect(ctx.content.paused).toBe(true);
  });

  it('toggles by intent: two quick presses pause and resume, even before the pause event', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    player.calls.length = 0;
    ctx.session.togglePause();
    ctx.session.togglePause(); // the native pause event has not come yet
    expect(player.calls).toEqual(['pause', 'play']);
  });

  it('a viewer pause before the first frame is not a stuck player', async () => {
    const ctx = setup(fixture('pod-optimized.xml'));
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    player.emitEnded(); // ad 2 loads on the same player
    await settle();
    ctx.session.togglePause();
    ctx.clock.advance(5_000);
    await settle();
    expect(ctx.events).not.toContain('error:405');
    expect(player.src).toBe('https://cdn.test/pod-2.mp4');
    ctx.session.togglePause(); // resumes; still no frame -> the watchdog runs again
    ctx.clock.advance(5_000);
    await settle();
    expect(ctx.events).toContain('error:405');
  });

  it('a system pause (media controls, voice) before the first frame is not a stuck player either', async () => {
    const ctx = setup(fixture('pod-optimized.xml'));
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    player.emitEnded();
    await settle();
    player.emitPause(); // the media controls handler pauses the player before its first frame
    ctx.clock.advance(5_000);
    await settle();
    expect(ctx.events).not.toContain('error:405');
  });

  it('does nothing outside the ad', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await loadReady(ctx);
    expect(ctx.session.togglePause()).toBe(false);
    expect(player.calls).not.toContain('pause');
  });
});

describe('AdBreakSession: stuck players never keep the content paused (goal 7, R7)', () => {
  it('sends 405 and returns to content when the ad shows no frame in time', async () => {
    const ctx = setup(fixture('inline.xml'));
    await contentAt(ctx.content, 42.5);
    await loadReady(ctx);
    await ctx.session.start(); // the player accepts play() but never renders (no flush)
    ctx.clock.advance(4_999);
    await settle();
    expect(ctx.session.state).toBe('playing');
    ctx.clock.advance(1);
    await settle();
    expect(ctx.events).toContain('error:405');
    expect(sent()).toContain('https://t.test/error?code=405');
    expect(ctx.session.state).toBe('finished');
    expect(ctx.content.calls.slice(-2)).toEqual(['play', 'focus']);
    expect(ctx.content.calls).not.toContain('seek:42.5');
  });

  it('fails the next pod ad on the same player when it shows no frame in time', async () => {
    const ctx = setup(fixture('pod-optimized.xml'));
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    player.emitEnded(); // ad 2 starts on the same player; it never renders
    await settle();
    ctx.clock.advance(5_000);
    await settle();
    expect(ctx.events).toContain('error:405');
    // R7: the buffet ad replaces it; it does not render either, so the break ends.
    expect(player.src).toBe('https://cdn.test/buffet.mp4');
    ctx.clock.advance(5_000);
    await settle();
    expect(ctx.events.filter((e) => e === 'error:405')).toHaveLength(2);
    expect(ctx.session.state).toBe('finished');
    expect(ctx.content.calls).toContain('play');
  });

  it('fails a prebuffered ad that shows no frame after the hand-over', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { standby: true });
    const first = await loadReady(ctx);
    await ctx.session.start();
    await first.flush();
    await settle();
    const standby = ctx.adPlayers[1] as FakePlayer;
    standby.emitCanPlay();
    await settle();
    first.emitEnded(); // switch to the standby player, which never renders
    await settle();
    expect(standby.calls).toContain('play');
    ctx.clock.advance(5_000);
    await settle();
    expect(ctx.events).toContain('error:405');
  });

  it('keeps playing when the first frame comes in time', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    for (let second = 1; second <= 60; second++) {
      ctx.clock.advance(1_000);
      player.emitTime(second % 10); // a real player reports its time several times a second
    }
    await settle();
    expect(ctx.events).not.toContain('error:405');
    expect(ctx.session.state).toBe('playing');
  });

  it('fails the ad at once when its player broke while waiting for the break', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await loadReady(ctx);
    player.emitError();
    await ctx.session.start();
    await settle();
    expect(ctx.events).toContain('error:405');
    expect(ctx.session.state).toBe('finished');
    expect(ctx.content.calls).toContain('play');
  });

  it('drops a standby player that fails after canplay and plays that ad on the current player', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { standby: true });
    const first = await loadReady(ctx);
    await ctx.session.start();
    await first.flush();
    await settle();
    const standby = ctx.adPlayers[1] as FakePlayer;
    standby.emitCanPlay();
    standby.emitError();
    await settle();
    expect(standby.deinitialized).toBe(true);

    first.emitTime(9.6); // no hand-over to a broken player
    await settle();
    expect(standby.calls).not.toContain('play');
    first.emitEnded();
    await settle();
    expect(first.calls.filter((c) => c.startsWith('src:'))).toEqual([
      'src:https://cdn.test/pod-1.mp4',
      'src:https://cdn.test/pod-2.mp4',
    ]);
    expect(ctx.session.state).toBe('playing');
  });
});

describe('AdBreakSession: event order and stuck players', () => {
  const POD3 = (): string => fixture('pod-optimized.xml').replace('<Ad id="buffet">', '<Ad id="pod-3" sequence="3">');
  const srcs = (p: FakePlayer): string[] => p.calls.filter((c) => c.startsWith('src:'));

  async function playFirst(ctx: ReturnType<typeof setup>): Promise<FakePlayer> {
    const first = await loadReady(ctx);
    await ctx.session.start();
    await first.flush();
    await settle();
    return first;
  }

  it('an ad that stalls after its first frame does not hold the content forever (C3-1)', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await playFirst(ctx);
    player.emitTime(3); // then nothing: no timeupdate, no error, no ended
    ctx.clock.advance(10 * 60_000);
    await settle();
    expect(ctx.events).toContain('error:405');
    expect(ctx.session.state).toBe('finished');
  });

  it('an ad that buffers without progress fails after 10 s', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await playFirst(ctx);
    player.emitTime(3);
    player.emitWaiting();
    ctx.clock.advance(9_900);
    await settle();
    expect(ctx.events).not.toContain('error:405');
    ctx.clock.advance(200);
    await settle();
    expect(ctx.events).toContain('error:405');
  });

  // On Fire TV the picture stops with no media event while the viewer talks to Alexa (6-13 s seen).
  it('an ad frozen with no event at all (voice assistant) gets 30 s before it counts as stalled', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await playFirst(ctx);
    player.emitTime(3);
    ctx.clock.advance(20_000);
    await settle();
    expect(ctx.events).not.toContain('error:405');
    player.emitTime(3.2); // the system gives the player back
    ctx.clock.advance(20_000);
    await settle();
    expect(ctx.events).not.toContain('error:405');
    ctx.clock.advance(10_100);
    await settle();
    expect(ctx.events).toContain('error:405');
  });

  it('progress after buffering goes back to the long timeout', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await playFirst(ctx);
    player.emitWaiting();
    player.emitTime(3);
    ctx.clock.advance(15_000);
    await settle();
    expect(ctx.events).not.toContain('error:405');
  });

  it('a paused ad is not a stalled ad', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await playFirst(ctx);
    player.emitTime(3);
    player.emitPause();
    ctx.clock.advance(10 * 60_000);
    await settle();
    expect(ctx.session.state).toBe('playing');
  });

  it('skip and ended in the same tick move on by one ad (C3-2)', async () => {
    const ctx = setup(POD3(), { standby: true });
    const first = await playFirst(ctx);
    expect(ctx.adPlayers).toHaveLength(2); // standby created, no canplay yet
    first.emitTime(5);
    expect(ctx.session.skip()).toBe(true);
    first.emitEnded();
    await settle();
    expect(srcs(first)).toEqual(['src:https://cdn.test/pod-1.mp4', 'src:https://cdn.test/pod-2.mp4']);
  });

  it('a late ended of the skipped ad does not complete the next ad (C3-3)', async () => {
    const ctx = setup(fixture('pod-optimized.xml'));
    const player = await playFirst(ctx);
    player.emitTime(5);
    expect(ctx.session.skip()).toBe(true);
    await settle();
    expect(player.src).toBe('https://cdn.test/pod-2.mp4');
    ctx.events.length = 0;
    player.emitEnded(); // belongs to pod-1
    await settle();
    expect(ctx.events).not.toContain('complete');
    expect(ctx.session.state).toBe('playing');
  });

  it('without <Duration> the hand-over waits for the end the player reports (C3-4)', async () => {
    const noDuration = fixture('pod-optimized.xml').replace(
      '<Linear skipoffset="00:00:05"><Duration>00:00:10</Duration>',
      '<Linear skipoffset="00:00:05">',
    );
    expect(noDuration).not.toBe(fixture('pod-optimized.xml'));
    const ctx = setup(noDuration, { standby: true });
    const first = await playFirst(ctx);
    const next = ctx.adPlayers[1] as FakePlayer;
    next.emitCanPlay();
    await settle();
    first.emitTime(1.0);
    await settle();
    expect(next.calls).not.toContain('play');
    first.emitTime(9.6);
    await settle();
    expect(next.calls).toContain('play');
  });

  it('without a valid <Duration> tracks start and quartiles from the length the player reports (C1-7)', async () => {
    const ctx = setup(
      fixture('inline.xml').replace('<Duration>00:00:10.000</Duration>', '<Duration>00:00:00</Duration>'),
    );
    const player = await playFirst(ctx);
    sent();
    player.emitTime(0.5);
    player.emitTime(2.6);
    expect(sent()).toEqual(['https://t.test/start', 'https://t.test/q1']);
  });

  it('the active ad is shown even when the finishing one never sends ended (C3-5)', async () => {
    const ctx = setup(POD3(), { standby: true });
    const first = await playFirst(ctx);
    const second = ctx.adPlayers[1] as FakePlayer;
    second.emitCanPlay();
    await settle();
    first.emitTime(9.6);
    await settle();
    await second.flush();
    first.emitEnded();
    await settle();
    const third = ctx.adPlayers[2] as FakePlayer;
    third.emitCanPlay();
    await settle();
    second.emitTime(14.6); // hand-over down to the lower surface
    await settle();
    await third.flush();
    await settle();
    // second never sends ended (stuck in its last 0.5 s)
    ctx.clock.advance(2_000);
    third.emitTime(1.5);
    await settle();
    expect(last(ctx.states)).toMatchObject({ position: 3, adSurface: SURFACE });
    expect(pixels.requests).toContain('https://t.test/imp-buffet');
    expect(second.deinitialized).toBe(true);
  });

  it('releasing the players during a hand-over settles the wait for the finishing one (C3-11)', async () => {
    const ctx = setup(POD3(), { standby: true });
    const first = await playFirst(ctx);
    const second = ctx.adPlayers[1] as FakePlayer;
    second.emitCanPlay();
    await settle();
    first.emitTime(9.6); // hand-over: first is the finishing player
    await settle();
    await second.flush();
    await settle();
    await ctx.session.interrupt(); // Home before first sends ended
    let settled = false;
    void (ctx.session as unknown as { releasing: Promise<void> }).releasing.then(() => (settled = true));
    await settle();
    expect(first.deinitialized).toBe(true);
    expect(settled).toBe(true);
  });

  it('an error of the finishing ad after the hand-over sends 405 for it, not complete (C1-3)', async () => {
    const imp1 = '<Impression><![CDATA[https://t.test/imp-pod-1]]></Impression>';
    const body = fixture('pod-optimized.xml').replace(
      imp1,
      `${imp1}<Error><![CDATA[https://t.test/error-pod-1?code=[ERRORCODE]]]></Error>`,
    );
    const ctx = setup(body, { standby: true });
    const first = await playFirst(ctx);
    const second = ctx.adPlayers[1] as FakePlayer;
    second.emitCanPlay();
    await settle();
    first.emitTime(9.6); // hand-over: first is the finishing player
    await settle();
    sent();
    first.emitError();
    await settle();
    expect(sent()).toEqual(['https://t.test/error-pod-1?code=405']);
    expect(ctx.events).not.toContain('complete');
    expect(adsOf(ctx, 'error:405')).toEqual(['pod-1']);
    expect(first.deinitialized).toBe(true);
    expect(ctx.session.state).toBe('playing');
  });

  it('a media error before canplay fails the ad at once, not after 8 s (C4-1)', async () => {
    const ctx = setup(fixture('inline.xml'));
    let result: string | null = null;
    void ctx.session.load([{ kind: 'url', url: TAG }]).then((r) => (result = r));
    await settle();
    (ctx.adPlayers[0] as FakePlayer).emitError();
    await settle();
    expect(result).toBe('empty');
    expect(ctx.events).toContain('error:400');
  });

  it('the pause that comes with the natural end sends no pause pixel (C1-2)', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await playFirst(ctx);
    player.emitTime(10);
    sent();
    player.emitPause(); // HTML media at its end: pause, then ended
    player.emitEnded();
    await settle();
    const pixelsSent = sent();
    expect(pixelsSent).toContain('https://t.test/complete');
    expect(pixelsSent).not.toContain('https://t.test/pause');
  });
});

describe('AdBreakSession: stall timeouts, more cases', () => {
  async function playFirst(ctx: ReturnType<typeof setup>): Promise<FakePlayer> {
    const first = await loadReady(ctx);
    await ctx.session.start();
    await first.flush();
    await settle();
    return first;
  }

  it('an ad with no event at all after its first frame gets 30 s', async () => {
    const ctx = setup(fixture('inline.xml'));
    await playFirst(ctx);
    ctx.clock.advance(29_900);
    await settle();
    expect(ctx.events).not.toContain('error:405');
    ctx.clock.advance(200);
    await settle();
    expect(ctx.events).toContain('error:405');
  });

  it('an ad resumed with togglePause after its first frame gets the stall timeout, not the first frame one', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await playFirst(ctx);
    player.emitTime(3);
    ctx.session.togglePause();
    ctx.session.togglePause(); // no playing event follows
    ctx.clock.advance(29_900);
    await settle();
    expect(ctx.events).not.toContain('error:405');
    ctx.clock.advance(200);
    await settle();
    expect(ctx.events).toContain('error:405');
  });

  it('a paused ad that reports waiting or a late time is not stalled', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await playFirst(ctx);
    player.emitTime(3);
    player.emitPause();
    player.emitWaiting();
    player.emitTime(3.1);
    ctx.clock.advance(10 * 60_000);
    await settle();
    expect(ctx.events).not.toContain('error:405');
    expect(ctx.session.state).toBe('playing');
  });

  it('a ready ad player that reports playing before the break starts is not failed while it waits', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await loadReady(ctx);
    void player.play();
    await player.flush();
    ctx.clock.advance(10 * 60_000);
    await settle();
    expect(ctx.events).not.toContain('error:405');
    expect(ctx.session.state).toBe('ready');
  });

  it('a pause in the last quarter second is the natural end, earlier it is a viewer pause', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await playFirst(ctx);
    player.emitTime(9.74);
    sent();
    player.emitPause();
    expect(sent()).toEqual(['https://t.test/pause']);

    const atEnd = setup(fixture('inline.xml'));
    const second = await playFirst(atEnd);
    second.emitTime(9.75);
    sent();
    second.emitPause();
    expect(sent()).toEqual([]);
  });

  it('a pause of a player that reports no length is a viewer pause', async () => {
    const ctx = setup(fixture('inline.xml'), { holdInit: (player) => (player.getDuration = () => 0) });
    const player = await playFirst(ctx);
    sent();
    player.emitPause();
    expect(sent()).toEqual(['https://t.test/pause']);
  });
});

describe('AdBreakSession: calls in the wrong state', () => {
  it('cancel() before start() leaves the content alone (C3-6)', async () => {
    const ctx = setup(fixture('inline.xml'));
    await contentAt(ctx.content, 42);
    const player = await loadReady(ctx);
    await ctx.session.cancel();
    expect(ctx.content.calls.filter((c) => c.startsWith('seek') || c === 'play')).toEqual([]);
    expect(player.deinitialized).toBe(false);
  });

  it('Back while the last ad player is being released sends one breakEnd (C3-12)', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    player.emitTime(10);
    player.emitEnded();
    void ctx.session.cancel();
    await settle();
    expect(ctx.events.filter((e) => e === 'breakEnd')).toHaveLength(1);
  });
});

describe('AdBreakSession: ad request macros', () => {
  it('fills the app macros in the ad tag (C1-1)', async () => {
    const tag = 'https://ads.test/tag.xml?lat=[LIMITADTRACKING]&ifa=[IFA]';
    const http = new FakeHttp().on('https://ads.test/tag.xml?lat=1&ifa=', { body: fixture('inline.xml') });
    const session = new AdBreakSession({
      http,
      clock: new FakeClock(1_000_000),
      content: new FakePlayer({ duration: 600 }),
      adSurface: SURFACE,
      createAdPlayer: () => new FakePlayer({ duration: 10 }),
      macros: { LIMITADTRACKING: '1', IFA: '', IFATYPE: '' },
    });
    void session.load([{ kind: 'url', url: tag }]);
    await settle();
    expect(http.requests).toEqual(['https://ads.test/tag.xml?lat=1&ifa=']);
  });
});

describe('AdBreakSession loudness', () => {
  /** pod-optimized.xml with the first ad at -16 LUFS and the second at -14 LUFS. */
  function loudPod(): string {
    const ext = (lufs: string) =>
      `</Linear><CreativeExtensions><CreativeExtension type="loudness"><IntegratedLoudness unit="LUFS">${lufs}</IntegratedLoudness></CreativeExtension></CreativeExtensions></Creative>`;
    return fixture('pod-optimized.xml')
      .replace(/(pod-2\.mp4\]\]><\/MediaFile>\s*<\/MediaFiles>)<\/Linear><\/Creative>/, `$1${ext('-14')}`)
      .replace(/(pod-1\.mp4\]\]><\/MediaFile>\s*<\/MediaFiles>)<\/Linear><\/Creative>/, `$1${ext('-16')}`);
  }

  it('turns the next pod ad down on the standby player too', async () => {
    const ctx = setup(loudPod(), { standby: true, contentLoudness: -24 });
    const first = await loadReady(ctx);
    await ctx.session.start();
    await first.flush();
    await settle();
    expect(first.calls.filter((c) => c.startsWith('volume'))).toEqual(['volume:0.398']);
    expect((ctx.adPlayers[1] as FakePlayer).calls.filter((c) => c.startsWith('volume') || c.startsWith('src'))).toEqual(
      ['volume:0.316', 'src:https://cdn.test/pod-2.mp4'],
    );
  });

  it('reports how much quieter an ad plays when it starts, not when it is prebuffered', async () => {
    const ctx = setup(loudPod(), { standby: true, contentLoudness: -24 });
    const first = await loadReady(ctx);
    await ctx.session.start();
    await first.flush();
    await settle();
    // pod-2 is turned down on the standby player already, but nobody has seen it yet.
    expect(ctx.events.filter((e) => e.startsWith('loudness') || e === 'impression')).toEqual([
      'impression',
      'loudness:-8.0',
    ]);
    await ctx.session.cancel();
    expect(ctx.events.filter((e) => e.startsWith('loudness'))).toEqual(['loudness:-8.0']);
  });

  it('reports the next ad of the pod when it starts', async () => {
    const ctx = setup(loudPod(), { standby: true, contentLoudness: -24 });
    const first = await loadReady(ctx);
    await ctx.session.start();
    await first.flush();
    await settle();
    const second = ctx.adPlayers[1] as FakePlayer;
    second.emitCanPlay();
    first.emitEnded();
    await settle();
    await second.flush();
    expect(ctx.events.filter((e) => e.startsWith('loudness') || e === 'impression')).toEqual([
      'impression',
      'loudness:-8.0',
      'impression',
      'loudness:-10.0',
    ]);
  });

  it('sets the volume again for each ad on one player, back to full for an ad without loudness', async () => {
    const pod = loudPod().replace(/<CreativeExtensions>.*?-14.*?<\/CreativeExtensions>/, '');
    const ctx = setup(pod, { contentLoudness: -24 });
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    player.emitEnded(); // ad 2 loads on the same player
    await settle();
    expect(player.calls.filter((c) => c.startsWith('volume') || c.startsWith('src'))).toEqual([
      'volume:0.398',
      'src:https://cdn.test/pod-1.mp4',
      'volume:1',
      'src:https://cdn.test/pod-2.mp4',
    ]);
  });
});

describe('AdBreakSession: why the break looks as it does', () => {
  const NO_REASON = { blockedAfterScene: [], sceneSignals: [], repeatsLeftOut: 0, quieter: false };

  it('names the advertiser left out after the scene, and what the scene showed', async () => {
    const pod = fixture('pod-cat.xml').replace(
      '<AdTitle>car</AdTitle>',
      '<AdTitle>car</AdTitle><Advertiser>Voltaro</Advertiser>',
    );
    const ctx = setup(pod, { blockedAdCategories: ['1571'], sceneSignals: ['vehicle crash'] });
    await loadReady(ctx);
    await ctx.session.start();
    expect(last(ctx.states)?.why).toEqual({
      ...NO_REASON,
      blockedAfterScene: ['Voltaro'],
      sceneSignals: ['vehicle crash'],
    });
  });

  it('keeps an ad without an advertiser as null, and the scene signals only when an ad was left out', async () => {
    const blocked = setup(fixture('pod-cat.xml'), { blockedAdCategories: ['1571'], sceneSignals: ['vehicle crash'] });
    await loadReady(blocked);
    expect(last(blocked.states)?.why?.blockedAfterScene).toEqual([null]);

    const fits = setup(fixture('pod-cat.xml'), { blockedAdCategories: ['1004'], sceneSignals: ['drinking'] });
    await loadReady(fits);
    expect(last(fits.states)?.why).toEqual(NO_REASON);
  });

  it('counts the ads the household saw recently', async () => {
    const repeats = new RepeatGuard(new FakeClock(0));
    const earlier = setup(fixture('pod-optimized.xml'), { repeats });
    const first = await loadReady(earlier);
    await earlier.session.start();
    await first.flush();

    const ctx = setup(fixture('pod-optimized.xml'), { repeats });
    await loadReady(ctx);
    expect(last(ctx.states)?.why).toEqual({ ...NO_REASON, repeatsLeftOut: 1 });
  });

  it('says when the ad on screen plays quieter than its file, to match the content', async () => {
    const loud = fixture('pod-optimized.xml').replace(
      /(pod-1\.mp4\]\]><\/MediaFile>\s*<\/MediaFiles>)<\/Linear><\/Creative>/,
      '$1</Linear><CreativeExtensions><CreativeExtension type="loudness"><IntegratedLoudness unit="LUFS">-16</IntegratedLoudness></CreativeExtension></CreativeExtensions></Creative>',
    );
    const ctx = setup(loud, { contentLoudness: -24 });
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    expect(last(ctx.states)?.why?.quieter).toBe(true);
    player.emitEnded(); // pod-2 has no loudness: full volume
    await settle();
    expect(last(ctx.states)?.why?.quieter).toBe(false);
  });
});

describe('AdBreakSession: blocked categories and spare ads', () => {
  const ad = (id: string, options: { sequence?: number; category?: string } = {}): string =>
    `<Ad id="${id}"${options.sequence ? ` sequence="${options.sequence}"` : ''}><InLine><AdSystem>fx</AdSystem><AdTitle>${id}</AdTitle>` +
    (options.category ? `<Category authority="https://iabtechlab.com">${options.category}</Category>` : '') +
    `<Impression><![CDATA[https://t.test/imp-${id}]]></Impression><Creatives><Creative><Linear><Duration>00:00:10</Duration><MediaFiles>` +
    `<MediaFile delivery="progressive" type="video/mp4" width="1280" height="720"><![CDATA[https://cdn.test/${id}.mp4]]></MediaFile>` +
    `</MediaFiles></Linear></Creative></Creatives></InLine></Ad>`;
  const vast = (...ads: string[]): string => `<VAST version="4.2">${ads.join('')}</VAST>`;

  /** Plays every ad of the break to its end; returns the files in the order they played. */
  async function playAll(ctx: ReturnType<typeof setup>): Promise<string[]> {
    const player = await loadReady(ctx);
    await ctx.session.start();
    for (let i = 0; i < 5 && ctx.session.state === 'playing'; i++) {
      await player.flush();
      player.emitEnded();
      await settle();
    }
    expect(ctx.session.state).toBe('finished');
    return player.calls.filter((c) => c.startsWith('src:')).map((c) => c.slice('src:https://cdn.test/'.length));
  }

  it('gives the places of blocked pod ads to the spare ads, lowest place first', async () => {
    const body = vast(
      ad('x', { sequence: 3, category: '1571' }),
      ad('y', { sequence: 1, category: '1571' }),
      ad('z', { sequence: 2 }),
      ad('s1'),
      ad('s2'),
    );
    const ctx = setup(body, { blockedAdCategories: ['1571'] });
    expect(await playAll(ctx)).toEqual(['s1.mp4', 'z.mp4', 's2.mp4']);
    expect(ctx.states.filter((s) => s.state === 'playing').map((s) => s.position)).toEqual(
      expect.arrayContaining([1, 2, 3]),
    );
  });

  it('keeps spare ads as spares when no ad of the break is blocked', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { blockedAdCategories: ['1571'] });
    expect(await playAll(ctx)).toEqual(['pod-1.mp4', 'pod-2.mp4']);
  });

  it('frees no place for a blocked spare ad', async () => {
    const ctx = setup(vast(ad('x', { sequence: 1 }), ad('s1', { category: '1571' }), ad('s2')), {
      blockedAdCategories: ['1571'],
    });
    expect(await playAll(ctx)).toEqual(['x.mp4']);
    expect(last(ctx.states)?.total).toBe(1);
  });

  it('leaves out an ad with any blocked category, with error 205 and skipped:category', async () => {
    const pod = fixture('pod-cat.xml').replace(
      '<Category authority="https://iabtechlab.com">1571</Category>',
      '<Category authority="https://iabtechlab.com">1004</Category><Category authority="https://iabtechlab.com">1571</Category>',
    );
    const ctx = setup(pod, { blockedAdCategories: ['1571'] });
    const player = await loadReady(ctx);
    expect(player.src).toBe('https://cdn.test/coffee.mp4');
    expect(sent()).toContain('https://t.test/err-car?code=205');
    expect(adsOf(ctx, 'skipped:category')).toEqual(['car']);
    expect(last(ctx.states)?.why?.sceneSignals).toEqual([]);
  });

  it('names the advertiser of a blocked ad without the spaces around it', async () => {
    const pod = fixture('pod-cat.xml').replace(
      '<AdTitle>car</AdTitle>',
      '<AdTitle>car</AdTitle><Advertiser>  Voltaro  </Advertiser>',
    );
    const ctx = setup(pod, { blockedAdCategories: ['1571'] });
    await loadReady(ctx);
    expect(last(ctx.states)?.why?.blockedAfterScene).toEqual(['Voltaro']);
  });
});

describe('AdBreakSession: viewer rules and event details', () => {
  it('counts only repeats as ads the household saw, not a second ad of one advertiser', async () => {
    const pod = fixture('pod-optimized.xml')
      .replace('<AdTitle>first</AdTitle>', '<AdTitle>first</AdTitle><Advertiser>Acme</Advertiser>')
      .replace('<AdTitle>second</AdTitle>', '<AdTitle>second</AdTitle><Advertiser>Acme</Advertiser>');
    const ctx = setup(pod, { repeats: new RepeatGuard(new FakeClock(0)) });
    await loadReady(ctx);
    expect(adsOf(ctx, 'skipped:advertiser')).toEqual(['pod-2']);
    expect(last(ctx.states)?.why?.repeatsLeftOut).toBe(0);
  });

  it('does not remember an ad that was left out of an earlier break', async () => {
    const repeats = new RepeatGuard(new FakeClock(0));
    const earlier = setup(fixture('pod-optimized.xml'), { repeats, maxAds: 1 });
    await loadReady(earlier);
    expect(earlier.events).toContain('notUsed');
    const ctx = setup(fixture('pod-optimized.xml'), { repeats });
    await loadReady(ctx);
    expect(ctx.events).not.toContain('skipped:repeat');
  });

  it('names the ad in each ad event', async () => {
    const ctx = setup(
      fixture('pod-optimized.xml').replace(
        /type="video\/mp4"([^>]*><!\[CDATA\[https:\/\/cdn\.test\/pod-2)/,
        'type="video/webm"$1',
      ),
      { maxAds: 2 },
    );
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    player.emitEnded();
    await settle();
    expect(adsOf(ctx, 'impression')).toEqual(['pod-1']);
    expect(adsOf(ctx, 'error:403')).toEqual(['pod-2']);

    const cut = setup(fixture('pod-optimized.xml'), { maxAds: 1 });
    await loadReady(cut);
    expect(adsOf(cut, 'skipped:budget')).toEqual(['pod-2']);
  });
});

describe('AdBreakSession: a player call that fails', () => {
  const twoSkippable = (): string => {
    const ad = (n: number) => `<Ad id="a${n}" sequence="${n}"><InLine><AdSystem>x</AdSystem><AdTitle>t${n}</AdTitle>
      <Impression><![CDATA[https://t.test/imp-${n}]]></Impression>
      <Creatives><Creative><Linear skipoffset="00:00:05"><Duration>00:00:10</Duration>
      <TrackingEvents><Tracking event="start"><![CDATA[https://t.test/start-${n}]]></Tracking>
      <Tracking event="firstQuartile"><![CDATA[https://t.test/q1-${n}]]></Tracking></TrackingEvents>
      <MediaFiles><MediaFile delivery="progressive" type="video/mp4" width="1280" height="720"><![CDATA[https://cdn.test/a${n}.mp4]]></MediaFile></MediaFiles>
      </Linear></Creative></Creatives></InLine></Ad>`;
    return `<VAST version="4.2">${ad(1)}${ad(2)}</VAST>`;
  };

  it.each([
    [
      'takes media controls focus',
      (c: FakePlayer) => (c.takeMediaControlFocus = () => Promise.reject(new Error('focus failed'))),
    ],
    ['plays', (c: FakePlayer) => (c.play = () => Promise.reject(new Error('play failed')))],
  ])('ends the break when the content player fails as it %s again', async (_name, breakIt) => {
    const content = new FakePlayer({ duration: 600 });
    const ctx = setup(fixture('inline.xml'), { content });
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    breakIt(content);
    player.emitTime(10);
    player.emitEnded();
    await settle();
    expect(ctx.session.state).toBe('finished');
    expect(ctx.events.filter((e) => e === 'breakEnd')).toHaveLength(1);
  });

  it('fails an ad whose play() is refused and goes back to the content, without throwing', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await loadReady(ctx);
    player.play = () => Promise.reject(new Error('play refused'));
    await expect(ctx.session.start()).resolves.toBeUndefined();
    ctx.clock.advance(5000); // no frame: the watchdog fails the ad
    await settle();
    expect(ctx.events).toContain('error:405');
    expect(ctx.session.state).toBe('finished');
  });

  it('ends the break once when Back comes twice while the ad player is released', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    let release = (): void => undefined;
    player.deinitialize = () => new Promise<void>((resolve) => (release = resolve));
    const first = ctx.session.cancel();
    const second = ctx.session.cancel();
    await settle();
    release();
    await Promise.all([first, second]);
    expect(ctx.events.filter((e) => e === 'breakEnd')).toHaveLength(1);
    expect(ctx.content.calls.filter((c) => c === 'play')).toHaveLength(1);
  });

  it('sends no start or quartile and allows no Skip on a late timeupdate before the next ad shows a frame', async () => {
    const ctx = setup(twoSkippable());
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    player.emitTime(6);
    expect(ctx.session.skip()).toBe(true);
    await settle();
    pixels.requests.splice(0);
    player.emitTime(6); // the previous source's time, after the switch
    await settle();
    expect(pixels.requests).toEqual([]);
    expect(ctx.session.skip()).toBe(false);
  });

  it('fails the ad and stays out of the way when the ad player cannot start', async () => {
    const ctx = setup(fixture('inline.xml'), { maxPlayers: 0 });
    await expect(ctx.session.load([{ kind: 'url', url: TAG }])).resolves.toBe('empty');
    expect(ctx.events).toContain('error:400');
    expect(ctx.adPlayers.every((p) => p.deinitialized)).toBe(true);
  });

  it('does not keep a player that finished starting after the break was left', async () => {
    let started = (): void => undefined;
    const ctx = setup(fixture('inline.xml'), {
      holdInit: (player) => {
        player.initialize = async () => {
          await new Promise<void>((resolve) => (started = resolve));
          await FakePlayer.prototype.initialize.call(player);
        };
      },
    });
    const loading = ctx.session.load([{ kind: 'url', url: TAG }]);
    await settle();
    await ctx.session.interrupt(); // Back or Home while the ad player is still starting
    started();
    await expect(loading).resolves.toBe('empty');
    expect(ctx.adPlayers[0]?.calls.some((c) => c.startsWith('src:'))).toBe(false);
    expect(ctx.adPlayers[0]?.deinitialized).toBe(true);
    expect(ctx.session.state).toBe('interrupted');
    expect(ctx.events).toEqual([]);
  });
});

describe('AdBreakSession: captions from <ClosedCaptionFiles>', () => {
  const VTT = 'https://cdn.test/ad.en.vtt';
  const withCaptions = (files: string): string =>
    fixture('inline.xml').replace('</MediaFiles>', `<ClosedCaptionFiles>${files}</ClosedCaptionFiles></MediaFiles>`);
  const englishAndGerman = withCaptions(
    '<ClosedCaptionFile type="text/vtt" language="de"><![CDATA[https://cdn.test/ad.de.vtt]]></ClosedCaptionFile>' +
      `<ClosedCaptionFile type="text/vtt" language="en"><![CDATA[${VTT}]]></ClosedCaptionFile>`,
  );
  const cues = 'WEBVTT\n\n00:00.000 --> 00:02.000\nSlow coffee\n\n00:02.000 --> 00:04.000\nfor long evenings\n';

  it('shows the cue at the ad time, in the viewer language', async () => {
    const ctx = setup(englishAndGerman, { captionLanguage: 'en-US' });
    ctx.http.on(VTT, { body: cues });
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    await settle();
    player.emitTime(1);
    expect(last(ctx.states)?.caption).toBe('Slow coffee');
    player.emitTime(3);
    expect(last(ctx.states)?.caption).toBe('for long evenings');
    player.emitTime(5);
    expect(last(ctx.states)?.caption).toBe('');
    expect(ctx.http.requests.filter((url) => url.endsWith('.vtt'))).toEqual([VTT]);
  });

  it('shows the caption as soon as a late file arrives', async () => {
    const ctx = setup(englishAndGerman, { captionLanguage: 'en' });
    let answer: (body: string) => void = () => undefined;
    const get = ctx.http.get.bind(ctx.http);
    ctx.http.get = (url, options) =>
      url === VTT
        ? new Promise((resolve) => {
            answer = (body) => resolve({ status: 200, ok: true, text: () => Promise.resolve(body) });
          })
        : get(url, options);
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    player.emitTime(1);
    expect(last(ctx.states)?.caption).toBe('');
    answer(cues);
    await settle();
    expect(last(ctx.states)?.caption).toBe('Slow coffee');
  });

  it('plays the ad without captions when the file fails, and sends no error', async () => {
    const ctx = setup(englishAndGerman, { captionLanguage: 'en' });
    ctx.http.on(VTT, { status: 500, body: cues }); // an error page is not the caption file
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    await settle();
    player.emitTime(1);
    expect(last(ctx.states)).toMatchObject({ state: 'playing', caption: '' });
    expect(sent().filter((url) => url.includes('error'))).toEqual([]);
  });

  it('asks for no caption file when the ad has none', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    player.emitTime(1);
    expect(last(ctx.states)?.caption).toBe('');
    expect(ctx.http.requests).toEqual([TAG]);
  });
});
