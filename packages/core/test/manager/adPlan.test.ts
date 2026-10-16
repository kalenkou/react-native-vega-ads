import { readFileSync } from 'fs';
import { adPlan, adPlanLabel } from '../../src/manager/adPlan';
import { PreloadedAds, preloadAds } from '../../src/manager/preloadAds';
import { FakeClock } from '../fakes/FakeClock';
import { FakeHttp } from '../fakes/FakeHttp';

const fixture = (name: string): string => readFileSync(`${__dirname}/../../fixtures/${name}`, 'utf8');
const VMAP = 'https://ads.test/vmap.xml';
const PRE = 'https://ads.test/pre.xml';

async function preload(preroll: { status?: number; body: string }): Promise<PreloadedAds> {
  const http = new FakeHttp().on(VMAP, { body: fixture('vmap/pre-mid-post.xml') }).on(PRE, preroll);
  return preloadAds({ vmapUrl: VMAP }, { http, clock: new FakeClock(0) });
}

describe('adPlan: the ads of a title, before Play', () => {
  it('counts the breaks and sums the pre-roll pod; buffet ads are spares, not extra ads', async () => {
    const plan = adPlan(await preload({ body: fixture('vast/pod-optimized.xml') }));
    expect(plan).toMatchObject({ breaks: 4, preroll: { ads: 2, seconds: 25, skipAfter: 5 } });
    expect(adPlanLabel(plan)).toBe('4 ad breaks · first: 2 ads, 25 s, skippable after 5 s');
  });

  it('shows a single non-skippable pre-roll', async () => {
    const plan = adPlan(await preload({ body: fixture('vast/inline.xml') }));
    expect(plan?.preroll).toEqual({ ads: 1, seconds: 10, skipAfter: null });
    expect(adPlanLabel(plan)).toBe('4 ad breaks · first: 1 ad, 10 s');
  });

  it('gives only the number of breaks when the pre-roll answer is empty or failed', async () => {
    expect(adPlan(await preload({ body: fixture('vast/empty.xml') }))).toMatchObject({ breaks: 4, preroll: null });
    expect(adPlanLabel(adPlan(await preload({ status: 500, body: '' })))).toBe('4 ad breaks');
  });

  it('lists where each break is, so an app can draw a break map', async () => {
    const plan = adPlan(await preload({ body: fixture('vast/inline.xml') }));
    expect(plan?.marks).toEqual([
      { at: { kind: 'start' }, sceneSignals: [] },
      { at: { kind: 'time', seconds: 90.5 }, sceneSignals: [] },
      { at: { kind: 'percent', percent: 50 }, sceneSignals: [] },
      { at: { kind: 'end' }, sceneSignals: [] },
    ]);
  });

  it('gives each mark what the scene before the break shows', () => {
    const preloaded: PreloadedAds = {
      key: 'k',
      at: 0,
      preroll: null,
      breaks: [
        { id: 'mid', offset: { kind: 'time', seconds: 162 }, sources: [], sceneSignals: ['injury'] },
        { id: 'post', offset: { kind: 'end' }, sources: [] },
      ],
    };
    expect(adPlan(preloaded)?.marks).toEqual([
      { at: { kind: 'time', seconds: 162 }, sceneSignals: ['injury'] },
      { at: { kind: 'end' }, sceneSignals: [] },
    ]);
  });

  it('is null when the schedule is unknown, and says so for a title without ads', () => {
    const failed: PreloadedAds = { key: 'k', at: 0, breaks: null, preroll: null };
    expect(adPlan(failed)).toBeNull();
    expect(adPlanLabel(null)).toBe('');
    expect(adPlanLabel({ breaks: 0, preroll: null, marks: [] })).toBe('No ads');
    expect(adPlanLabel({ breaks: 1, preroll: null, marks: [] })).toBe('1 ad break');
  });

  it('takes the app\'s own words', () => {
    const label = adPlanLabel({ breaks: 2, preroll: null, marks: [] }, { adPlan: (plan) => `${plan.breaks} Werbepausen` });
    expect(label).toBe('2 Werbepausen');
  });
});
