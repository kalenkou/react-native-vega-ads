import { readFileSync } from 'fs';
import { PauseAdController, PauseAdView } from '../../src/pause/PauseAdController';
import { installImagePolyfill } from '../../src/vast';
import { FakeClock } from '../fakes/FakeClock';
import { FakeHttp } from '../fakes/FakeHttp';
import { FakePlayer } from '../fakes/FakePlayer';

const PAUSE = fixture('pause.xml');
const TAG = 'https://ads.test/pause.xml';

function fixture(name: string): string {
  return readFileSync(`${__dirname}/../../fixtures/vast/${name}`, 'utf8');
}

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

async function setup(options: { body?: string; canShow?: () => boolean } = {}) {
  const http = new FakeHttp().on(TAG, { body: options.body ?? PAUSE });
  const clock = new FakeClock(1_000_000);
  const content = new FakePlayer({ duration: 600 });
  await content.initialize();
  const views: Array<PauseAdView | null> = [];
  const events: string[] = [];
  const controller = new PauseAdController({
    http,
    clock,
    content,
    source: TAG,
    canShow: options.canShow ?? (() => true),
    onChange: (view) => views.push(view),
    onEvent: (name) => events.push(name),
  });
  controller.start();
  await settle();
  const shown = (): PauseAdView | null => views[views.length - 1] ?? null;
  /** The viewer resumes the content with the remote. */
  const resume = async () => {
    await content.play();
    await content.flush();
  };
  return { http, clock, content, controller, views, events, shown, resume };
}

const sent = (): string[] => pixels.requests.splice(0);

describe('PauseAdController', () => {
  it('asks the ad server for the pause ad once in advance', async () => {
    const ctx = await setup();
    expect(ctx.http.requests).toEqual([TAG]);
  });

  it('shows the pause ad 1.5 s after the viewer paused, with impression, and hides it on play', async () => {
    const ctx = await setup();
    sent();
    ctx.content.emitPause();
    ctx.clock.advance(1_499);
    expect(ctx.views).toEqual([]);
    ctx.clock.advance(1);
    expect(ctx.shown()).toMatchObject({ imageUrl: 'https://cdn.test/pause.png', width: 600, height: 600 });
    // No IFA macro given: vast-client fills an unknown macro with -1.
    expect(sent()).toEqual(['https://t.test/imp-pause?ifa=-1', 'https://t.test/pause-view']);

    ctx.clock.advance(8_000);
    await ctx.resume();
    expect(ctx.shown()).toBeNull();
    expect(sent()).toEqual(['https://t.test/pause-duration?d=00%3A00%3A08.000']);
    expect(ctx.events).toEqual(['pauseAd:impression', 'pauseAd:creativeView', 'pauseAd:overlayViewDuration']);
  });

  it('shows nothing for a short pause', async () => {
    const ctx = await setup();
    ctx.content.emitPause();
    ctx.clock.advance(1_000);
    await ctx.resume();
    ctx.clock.advance(5_000);
    expect(ctx.views).toEqual([]);
  });

  it('shows nothing when the pause is not the viewer’s: a break, before the content or after its end', async () => {
    let allowed = false;
    const ctx = await setup({ canShow: () => allowed });
    ctx.content.emitPause();
    ctx.clock.advance(2_000);
    expect(ctx.views).toEqual([]);

    // Allowed when the pause starts, but a break began before the delay ended.
    allowed = true;
    await ctx.resume();
    ctx.content.emitPause();
    allowed = false;
    ctx.clock.advance(2_000);
    expect(ctx.views).toEqual([]);
  });

  it('lets the viewer close it: close pixel, and Back is consumed only while it is on screen', async () => {
    const ctx = await setup();
    expect(ctx.controller.close()).toBe(false);
    ctx.content.emitPause();
    ctx.clock.advance(1_500);
    ctx.clock.advance(3_000);
    sent();
    expect(ctx.controller.close()).toBe(true);
    expect(ctx.shown()).toBeNull();
    expect(sent()).toEqual(['https://t.test/pause-duration?d=00%3A00%3A03.000', 'https://t.test/pause-close']);
    expect(ctx.controller.close()).toBe(false);
  });

  it('gets a fresh pause ad for the next pause', async () => {
    const ctx = await setup();
    ctx.content.emitPause();
    ctx.clock.advance(1_500);
    await settle();
    expect(ctx.http.requests).toEqual([TAG, TAG]);
    await ctx.resume();
    ctx.content.emitPause();
    ctx.clock.advance(1_500);
    expect(ctx.shown()).toMatchObject({ imageUrl: 'https://cdn.test/pause.png' });
  });

  it('shows nothing when the ad server has no pause ad, and asks again on the next pause', async () => {
    const ctx = await setup({ body: fixture('empty.xml') });
    ctx.content.emitPause();
    ctx.clock.advance(1_500);
    await settle();
    expect(ctx.views).toEqual([]);
    expect(ctx.http.requests).toEqual([TAG, TAG]);
  });

  it('ignores a second pause event while the ad is on screen', async () => {
    const ctx = await setup();
    ctx.content.emitPause();
    ctx.clock.advance(1_500);
    await settle();
    ctx.content.emitPause();
    ctx.clock.advance(1_500);
    expect(ctx.views).toHaveLength(1);
    expect(ctx.events.filter((e) => e === 'pauseAd:impression')).toHaveLength(1);
  });

  it('never has two pause ad requests on their way at once', async () => {
    const ctx = await setup({ body: fixture('empty.xml') });
    ctx.content.emitPause();
    ctx.clock.advance(1_500); // nothing to show: a new request starts
    await ctx.resume();
    ctx.content.emitPause();
    ctx.clock.advance(1_500); // that request has not answered yet
    expect(ctx.http.requests).toEqual([TAG, TAG]);
  });

  it('stops listening and hides the ad when disposed', async () => {
    const ctx = await setup();
    ctx.content.emitPause();
    ctx.clock.advance(1_500);
    ctx.controller.dispose();
    expect(ctx.shown()).toBeNull();
    await settle(); // the next pause ad has arrived
    await ctx.resume();
    ctx.content.emitPause();
    ctx.clock.advance(1_500);
    expect(ctx.views.filter((v) => v !== null)).toHaveLength(1);
  });
});
