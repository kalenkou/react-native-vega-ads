import { readFileSync } from 'fs';
import TestRenderer, { act } from 'react-test-renderer';
import { FakeClock } from '../../core/test/fakes/FakeClock';
import { FakeHttp } from '../../core/test/fakes/FakeHttp';
import type { AdPlan, AdSchedule } from 'react-native-ads-core';
import { preloadVegaAds, takePreload, useAdPlan } from '../src/preloadVegaAds';
import { useVegaAds, UseVegaAdsOptions, VegaAds } from '../src/useVegaAds';
import { FakeW3cPlayer } from './fakes/FakeW3cPlayer';

const inline = readFileSync(`${__dirname}/../../core/fixtures/vast/inline.xml`, 'utf8');

const g = globalThis as Record<string, unknown>;
beforeEach(() => {
  g.window = g;
  delete g.Image;
});
const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((r) => r.unmount());
  });
  delete g.window;
  delete g.Image;
});

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
}

function Harness({ options, out }: { options: UseVegaAdsOptions; out: { current: VegaAds | null } }): null {
  out.current = useVegaAds(options);
  return null;
}

let next = 0;
/** A schedule no other test has preloaded: the preloads live in the module. */
function fresh(query = ''): { url: string; schedule: { breaks: Array<{ offset: 'start'; vastUrl: string }> } } {
  next += 1;
  const url = `https://ads.test/pre-${next}.xml${query}`;
  return { url, schedule: { breaks: [{ offset: 'start', vastUrl: url }] } };
}

/** A player screen for `source`, with its surfaces ready. */
async function play(source: UseVegaAdsOptions['source'], http: FakeHttp, clock: FakeClock) {
  const out: { current: VegaAds | null } = { current: null };
  const adPlayers: FakeW3cPlayer[] = [];
  const content = new FakeW3cPlayer(600);
  content.autoplay = false;
  const options: UseVegaAdsOptions = {
    source,
    contentPlayer: content,
    componentInstance: () => ({ name: 'main' }),
    http,
    clock,
    createVideoPlayer: () => {
      const player = new FakeW3cPlayer(10);
      adPlayers.push(player);
      return player;
    },
  };
  act(() => {
    mounted.push(TestRenderer.create(<Harness options={options} out={out} />));
  });
  const ads = (): VegaAds => out.current as VegaAds;
  act(() => ads().surfaces.onContentSurface('c1'));
  act(() => ads().surfaces.onAdSurface('a1'));
  act(() => ads().surfaces.onStandbySurface('b1'));
  await settle();
  return { ads, adPlayers };
}

describe('preloadVegaAds', () => {
  it('the player uses the preloaded pre-roll and does not ask again', async () => {
    const { url, schedule } = fresh();
    const http = new FakeHttp().on(url, { body: inline });
    const clock = new FakeClock(1_000_000);
    preloadVegaAds(schedule, { http, clock });
    await settle();
    expect(http.requests).toEqual([url]);

    const { ads, adPlayers } = await play(schedule, http, clock);
    expect(http.requests).toEqual([url]);
    expect(adPlayers).toHaveLength(1);
    act(() => adPlayers[0]?.emit('canplay'));
    await settle();
    act(() => adPlayers[0]?.emit('playing'));
    await settle();
    expect(ads().playing).toBe(true);
  });

  it('sends the advertising ID macros with the early request', async () => {
    const { url, schedule } = fresh('?ifa=[IFA]&lat=[LIMITADTRACKING]');
    const http = new FakeHttp();
    const clock = new FakeClock(1_000_000);
    const adId = { isAdvertisingTrackingEnabled: () => true, fetchAdvertisingId: () => 'id-1' };
    preloadVegaAds(schedule, { adId, http, clock });
    await settle();
    expect(http.requests).toEqual([url.replace('[IFA]', 'id-1').replace('[LIMITADTRACKING]', '0')]);
  });

  it('sends the same break limits as the player with the early request', async () => {
    const { url, schedule } = fresh('?ads=[BREAKMAXADS]&dur=[BREAKMAXDURATION]');
    const http = new FakeHttp();
    const clock = new FakeClock(1_000_000);
    preloadVegaAds(schedule, { http, clock, maxBreakAds: 2, maxBreakSeconds: 45 });
    await settle();
    expect(http.requests).toEqual([url.replace('[BREAKMAXADS]', '2').replace('[BREAKMAXDURATION]', '45')]);
  });

  it('a second call within a minute keeps the first preload', async () => {
    const { url, schedule } = fresh();
    const http = new FakeHttp().on(url, { body: inline });
    const clock = new FakeClock(1_000_000);
    preloadVegaAds(schedule, { http, clock });
    clock.advance(59_000);
    preloadVegaAds(schedule, { http, clock });
    await settle();
    expect(http.requests).toEqual([url]);

    clock.advance(1_000);
    preloadVegaAds(schedule, { http, clock });
    await settle();
    expect(http.requests).toEqual([url, url]);
  });

  it('is used once: the next player of the same title asks the ad server itself', async () => {
    const { url, schedule } = fresh();
    const http = new FakeHttp().on(url, { body: inline });
    const clock = new FakeClock(1_000_000);
    preloadVegaAds(schedule, { http, clock });
    await settle();
    await play(schedule, http, clock);
    expect(takePreload(JSON.stringify(schedule))).toBeUndefined();
    await play(schedule, http, clock);
    expect(http.requests).toEqual([url, url]);
  });

  it('a player of another title leaves the preload for its own title', async () => {
    const first = fresh();
    const second = fresh();
    const http = new FakeHttp().on(first.url, { body: inline }).on(second.url, { body: inline });
    const clock = new FakeClock(1_000_000);
    preloadVegaAds(first.schedule, { http, clock });
    await settle();
    await play(second.schedule, http, clock);
    expect(http.requests).toEqual([first.url, second.url]);
    expect(takePreload(JSON.stringify(first.schedule))).toBeDefined();
  });

  it('keeps at most four titles waiting, dropping the oldest', async () => {
    const http = new FakeHttp();
    const clock = new FakeClock(1_000_000);
    const titles = [fresh(), fresh(), fresh(), fresh(), fresh()];
    titles.forEach((t) => preloadVegaAds(t.schedule, { http, clock }));
    await settle();
    expect(takePreload(JSON.stringify(titles[0]?.schedule))).toBeUndefined();
    titles.slice(1).forEach((t) => expect(takePreload(JSON.stringify(t.schedule))).toBeDefined());
  });
});

describe('useAdPlan', () => {
  function PlanHarness({ schedule, http, clock, out }: { schedule: AdSchedule; http: FakeHttp; clock: FakeClock; out: { current: AdPlan | null } }): null {
    out.current = useAdPlan(schedule, { http, clock });
    return null;
  }

  it('preloads the schedule and tells the page what the viewer will see', async () => {
    const { url, schedule } = fresh();
    const http = new FakeHttp().on(url, { body: inline });
    const clock = new FakeClock(0);
    const out: { current: AdPlan | null } = { current: null };
    act(() => {
      mounted.push(TestRenderer.create(<PlanHarness schedule={schedule} http={http} clock={clock} out={out} />));
    });
    expect(out.current).toBeNull();
    await settle();
    expect(out.current).toEqual({ breaks: 1, preroll: { ads: 1, seconds: 10, skipAfter: null } });
    expect(http.requests).toEqual([url]);
    // The player still gets the same answers: no second request after Play.
    expect(takePreload(JSON.stringify(schedule))).toBeDefined();
  });
});
