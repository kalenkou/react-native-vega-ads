import { readFileSync } from 'fs';
import { installImagePolyfill } from '../../src/vast/polyfill/image';
import { requestVast, LinearAd } from '../../src/vast/request/VastRequester';
import { stitchedBreak, StitchedAdTracker } from '../../src/stitched/StitchedAdTracker';
import { FakeClock } from '../fakes/FakeClock';
import { FakeHttp } from '../fakes/FakeHttp';

const URL = 'https://ads.test/inline.xml';
const INLINE = readFileSync(`${__dirname}/../../fixtures/vast/inline.xml`, 'utf8');
const SKIPPABLE = INLINE.replace('<Linear>', '<Linear skipoffset="00:00:05">');

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

async function loadAd(body = INLINE): Promise<LinearAd> {
  const result = await requestVast(URL, { http: new FakeHttp().on(URL, { body }), clock: new FakeClock() });
  if (result.status !== 'ok' || !result.ads[0]) throw new Error(result.status);
  return result.ads[0];
}

/** Two 10 s ads stitched at 100 s (100–110, 110–120) and one at 300 s. */
async function setup(body = INLINE) {
  const events: string[] = [];
  const ads = [...stitchedBreak(100, [await loadAd(body), await loadAd(body)]), ...stitchedBreak(300, [await loadAd(body)])];
  const tracker = new StitchedAdTracker(ads, { onEvent: (name) => events.push(name) });
  const play = (from: number, to: number) => {
    for (let t = from; t <= to + 1e-9; t += 0.25) tracker.update(Number(t.toFixed(2)));
  };
  return { tracker, events, play };
}

it('places the ads of a break one after another from the break time', async () => {
  const ads = stitchedBreak(100, [await loadAd(), await loadAd()]);
  expect(ads.map((a) => [a.start, a.end, a.index, a.count])).toEqual([
    [100, 110, 1, 2],
    [110, 120, 2, 2],
  ]);
});

it('tracks stitched ads by the content time: impression, quartiles and complete for each', async () => {
  const { events, play } = await setup();
  play(98, 121);
  expect(events).toEqual([
    'impression',
    'start',
    'firstQuartile',
    'midpoint',
    'thirdQuartile',
    'complete',
    'impression',
    'start',
    'firstQuartile',
    'midpoint',
    'thirdQuartile',
    'complete',
  ]);
});

it('knows which ad plays, for the ad label: position in the break and seconds left', async () => {
  const { tracker, play } = await setup();
  play(98, 99);
  expect(tracker.current()).toBeNull();
  play(99.25, 113.5);
  expect(tracker.current()).toEqual({ index: 2, count: 2, remaining: 7, secondsUntilSkip: null });
});

it('a seek out of an ad ends its tracking without complete; a seek into the middle of an ad tracks nothing', async () => {
  const { tracker, events, play } = await setup();
  play(99, 104);
  tracker.update(200);
  tracker.update(305);
  play(305.25, 320);
  expect(events).toEqual(['impression', 'start', 'firstQuartile']);
  expect(tracker.current()).toBeNull();
});

it('a seek to the start of a break plays its ads normally', async () => {
  const { events, play, tracker } = await setup();
  play(10, 11);
  tracker.update(299.5);
  play(299.75, 311);
  expect(events).toEqual(['impression', 'start', 'firstQuartile', 'midpoint', 'thirdQuartile', 'complete']);
});

it('an ad seen once is not tracked again when the viewer goes back over it', async () => {
  const { tracker, events, play } = await setup();
  play(299, 311);
  const once = [...events];
  tracker.update(299);
  play(299.25, 305);
  expect(tracker.current()).toBeNull();
  play(305.25, 311);
  expect(events).toEqual(once);
});

it('a seek back out of an ad ends it too', async () => {
  const { tracker, events, play } = await setup();
  play(99, 104);
  tracker.update(50);
  expect(tracker.current()).toBeNull();
  play(50.25, 52);
  expect(events).toEqual(['impression', 'start', 'firstQuartile']);
});

it('pause and resume during an ad are tracked', async () => {
  const { tracker, events, play } = await setup();
  play(99, 101);
  tracker.paused();
  tracker.resumed();
  tracker.paused();
  expect(events.slice(-3)).toEqual(['pause', 'resume', 'pause']);
});

it('skip is allowed after the skip offset and returns where the content goes on', async () => {
  const { tracker, events, play } = await setup(SKIPPABLE);
  play(99, 103);
  expect(tracker.current()?.secondsUntilSkip).toBe(2);
  expect(tracker.skip()).toBeNull();
  play(103.25, 106);
  expect(tracker.skip()).toBe(110);
  expect(tracker.current()).toBeNull();
  expect(events.slice(-1)).toEqual(['skip']);
  tracker.update(110);
  play(110.25, 111);
  expect(events.filter((e) => e === 'impression')).toHaveLength(2);
});
