import { readFileSync } from 'fs';
import { AdBreakSession, SessionSnapshot } from '../../src/machine/AdBreakSession';
import { installImagePolyfill } from '@vega-ads/vast';
import { FakeClock } from '../../../vast/test/fakes/FakeClock';
import { FakeHttp } from '../../../vast/test/fakes/FakeHttp';
import { FakePlayer } from '../fakes/FakePlayer';

const fixture = (name: string): string => readFileSync(`${__dirname}/../../../vast/fixtures/vast/${name}`, 'utf8');
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

function setup(body: string, options: { budgetMs?: number; standby?: boolean; maxPlayers?: number } = {}) {
  const http = new FakeHttp().on(TAG, { body });
  const clock = new FakeClock(1_000_000);
  const content = new FakePlayer({ duration: 600 });
  void content.initialize(); // the app's content player is ready before any break
  const adPlayers: FakePlayer[] = [];
  const states: SessionSnapshot[] = [];
  const events: string[] = [];
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
      adPlayers.push(player);
      return player;
    },
    budgetMs: options.budgetMs,
    onChange: (snapshot) => states.push(snapshot),
    onEvent: (name) => events.push(name),
  });
  return { session, content, adPlayers, states, events, clock };
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

describe('AdBreakSession – loading (R10)', () => {
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
  });

  it('sends 400 and gives up on an ad that never becomes playable', async () => {
    const ctx = setup(fixture('inline.xml'));
    const loading = ctx.session.load([{ kind: 'url', url: TAG }]);
    await settle();
    ctx.clock.advance(8000);
    await expect(loading).resolves.toBe('empty');
    expect(sent()).toContain('https://t.test/error?code=400');
    expect(ctx.adPlayers[0]?.deinitialized).toBe(true);
  });
});

describe('AdBreakSession – playing (R1, R2, R11, R12, R21)', () => {
  it('pauses content, plays the ad, moves media controls to it and tracks the impression on the first frame', async () => {
    const ctx = setup(fixture('inline.xml'));
    await contentAt(ctx.content, 42.5);
    const player = await loadReady(ctx);
    sent();
    await ctx.session.start();
    expect(ctx.content.calls).toContain('pause');
    expect(player.calls).toContain('play');
    expect(player.hasMediaControlFocus).toBe(true);
    expect(sent().filter((u) => u.includes('/impression'))).toEqual([]);
    await player.flush();
    expect(sent().filter((u) => u.includes('/impression'))).toHaveLength(2);
    expect(ctx.session.state).toBe('playing');
    expect(last(ctx.states)).toMatchObject({ state: 'playing', position: 1, total: 1 });
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

describe('AdBreakSession – pods (R17)', () => {
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
    player.emitError('decoder failed');
    await settle();
    expect(player.src).toBe('https://cdn.test/buffet.mp4');
    expect(last(ctx.states)).toMatchObject({ position: 1, total: 2 });
    expect(ctx.events).toContain('error:405');
  });

  it('stops the pod when the next ad would pass the break budget', async () => {
    const ctx = setup(fixture('pod-optimized.xml'), { budgetMs: 20_000 });
    const player = await loadReady(ctx);
    await ctx.session.start();
    await player.flush();
    ctx.clock.advance(10_000);
    player.emitEnded();
    await settle();
    expect(ctx.session.state).toBe('finished');
  });
});

describe('AdBreakSession – viewer actions (R8, R13, R23)', () => {
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
    expect(ctx.content.calls).toContain('seek:12');
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
    expect(ctx.content.calls.slice(-3)).toEqual(['seek:30', 'play', 'focus']);
    expect(ctx.session.state).toBe('finished');
  });

  it('ignores start before the break is ready', async () => {
    const ctx = setup(fixture('inline.xml'));
    await expect(ctx.session.start()).rejects.toThrow('not ready');
  });
});

describe('AdBreakSession – back-to-back ads on two ad players', () => {
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
    expect(next.hasMediaControlFocus).toBe(true);
    expect(first.calls.filter((c) => c.startsWith('src:'))).toHaveLength(1);
    expect(first.deinitialized).toBe(true);
    await next.flush();
    await settle();
    expect(last(ctx.states)).toMatchObject({ position: 2, total: 2, adSurface: STANDBY });
    expect(pixels.requests).toContain('https://t.test/imp-pod-2');
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
    expect(next.hasMediaControlFocus).toBe(true);
    expect(first.deinitialized).toBe(false);
    // One sound at a time (Fire TV audio focus test): the finishing ad is silenced.
    expect(first.muted).toBe(true);
    expect(next.muted).toBe(false);
    // The standby surface is above the first one: show it as soon as the next ad starts.
    expect(last(ctx.states)).toMatchObject({ adSurface: STANDBY });
    await next.flush();
    await settle();
    expect(last(ctx.states)).toMatchObject({ position: 2, adSurface: STANDBY });
    expect(ctx.events.filter((e) => e === 'complete')).toHaveLength(0);
    first.emitEnded();
    await settle();
    expect(ctx.events.filter((e) => e === 'complete')).toHaveLength(1);
    expect(first.deinitialized).toBe(true);
    expect(ctx.session.state).toBe('playing');
  });

  it('prebuffers the third ad on the first surface only after the first ad player is released', async () => {
    const ctx = setup(fixture('pod-optimized.xml').replace('<Ad id="buffet">', '<Ad id="pod-3" sequence="3">'), { standby: true });
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

  it('when the next ad is on the lower surface, keeps the upper one shown until its ad ends', async () => {
    const ctx = setup(fixture('pod-optimized.xml').replace('<Ad id="buffet">', '<Ad id="pod-3" sequence="3">'), { standby: true });
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
    first.emitError('decoder failed');
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

describe('AdBreakSession – remote play/pause from the app key handler', () => {
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

describe('AdBreakSession – stuck players never keep the content paused (goal 7, R7)', () => {
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
    expect(ctx.content.calls.slice(-3)).toEqual(['seek:42.5', 'play', 'focus']);
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
    ctx.clock.advance(60_000);
    await settle();
    expect(ctx.events).not.toContain('error:405');
    expect(ctx.session.state).toBe('playing');
  });

  it('fails the ad at once when its player broke while waiting for the break', async () => {
    const ctx = setup(fixture('inline.xml'));
    const player = await loadReady(ctx);
    player.emitError('decoder lost');
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
    standby.emitError('stream broke');
    await settle();
    expect(standby.deinitialized).toBe(true);

    first.emitTime(9.6); // no hand-over to a broken player
    await settle();
    expect(standby.calls).not.toContain('play');
    first.emitEnded();
    await settle();
    expect(first.calls.filter((c) => c.startsWith('src:'))).toEqual(['src:https://cdn.test/pod-1.mp4', 'src:https://cdn.test/pod-2.mp4']);
    expect(ctx.session.state).toBe('playing');
  });
});
