import { readFileSync } from 'fs';
import { installImagePolyfill } from '../../src/vast/polyfill/image';
import { requestVast, LinearAd } from '../../src/vast/request/VastRequester';
import {
  loadStitchedAds,
  loadStitchedBreaks,
  placeStitchedBreaks,
  stitchedBreak,
  StitchedAdTracker,
} from '../../src/stitched/StitchedAdTracker';
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

/** Two 10 s ads stitched at 100 s (100-110, 110-120) and one at 300 s. */
async function setup(body = INLINE) {
  const events: string[] = [];
  const ads = [
    ...stitchedBreak(100, [await loadAd(body), await loadAd(body)]),
    ...stitchedBreak(300, [await loadAd(body)]),
  ];
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

it('the pause a player sends just before the end of an ad is not counted', async () => {
  const { tracker, events, play } = await setup();
  play(299, 309.75);
  tracker.paused();
  expect(events).not.toContain('pause');
});

it('when the stream ends during an ad: complete if it played to its end, else no complete', async () => {
  const { tracker, events, play } = await setup();
  play(299, 309.5);
  tracker.streamEnded();
  expect(events.slice(-2)).toEqual(['thirdQuartile', 'complete']);
  expect(tracker.current()).toBeNull();
  const second = await setup();
  second.play(299, 304);
  second.tracker.streamEnded();
  expect(second.events).toEqual(['impression', 'start', 'firstQuartile']);
  expect(second.tracker.current()).toBeNull();
});

it('place() moves the ads, for example once the stream length is known; an ad keeps its progress', async () => {
  const [a, b, c] = [await loadAd(), await loadAd(), await loadAd()];
  const events: string[] = [];
  const tracker = new StitchedAdTracker(stitchedBreak(0, [a]), { onEvent: (name) => events.push(name) });
  for (let t = 0; t <= 4; t += 0.25) tracker.update(t);
  tracker.place([...stitchedBreak(0, [a]), ...stitchedBreak(50, [b]), ...stitchedBreak(90, [c])]);
  for (let t = 4.25; t <= 60; t += 0.25) tracker.update(t);
  tracker.place([...stitchedBreak(0, [a]), ...stitchedBreak(50, [b]), ...stitchedBreak(95, [c])]);
  for (let t = 60.25; t <= 92; t += 0.25) tracker.update(t);
  expect(tracker.current()).toBeNull();
  for (let t = 92.25; t <= 106; t += 0.25) tracker.update(t);
  expect(events.filter((e) => e === 'impression')).toHaveLength(3);
  expect(events.filter((e) => e === 'complete')).toHaveLength(3);
});

it('skip is allowed after the skip offset and returns where the content goes on; the label counts whole seconds', async () => {
  const { tracker, events, play } = await setup(SKIPPABLE);
  play(99, 103);
  expect(tracker.current()?.secondsUntilSkip).toBe(2);
  expect(tracker.skip()).toBeNull();
  play(103.25, 103.5);
  expect(tracker.current()).toEqual({ index: 1, count: 2, remaining: 7, secondsUntilSkip: 2 });
  play(103.75, 106);
  expect(tracker.skip()).toBe(110);
  expect(tracker.current()).toBeNull();
  expect(events.slice(-1)).toEqual(['skip']);
  tracker.update(110);
  play(110.25, 111);
  expect(events.filter((e) => e === 'impression')).toHaveLength(2);
});

describe('loadStitchedAds', () => {
  const vmap = (name: string) => readFileSync(`${__dirname}/../../fixtures/vmap/${name}`, 'utf8');
  const VMAP = 'https://ads.test/vmap.xml';

  it('places every break of the VMAP on the stitched stream: start, time, percent and end', async () => {
    const http = new FakeHttp()
      .on(VMAP, { body: vmap('pre-mid-post.xml') })
      .on('https://ads.test/pre.xml', { body: INLINE })
      .on('https://ads.test/mid1.xml', { body: INLINE })
      .on('https://ads.test/mid2.xml', { body: INLINE })
      .on('https://ads.test/post.xml', { body: INLINE });
    const ads = await loadStitchedAds(VMAP, { http, clock: new FakeClock() }, 600);
    expect(ads.map((a) => [a.start, a.end])).toEqual([
      [0, 10],
      [90.5, 100.5],
      [300, 310],
      [590, 600],
    ]);
  });

  it('a standard pod (two sources at one time) becomes one break of two ads', async () => {
    const http = new FakeHttp()
      .on(VMAP, { body: vmap('standard-pod.xml') })
      .on('https://ads.test/pod-a.xml', { body: INLINE })
      .on('https://ads.test/pod-b.xml', { body: INLINE })
      .on('https://ads.test/pod-c.xml', { body: INLINE });
    const ads = await loadStitchedAds(VMAP, { http, clock: new FakeClock() }, 600);
    expect(ads.map((a) => [a.start, a.index, a.count])).toEqual([
      [15, 1, 2],
      [25, 2, 2],
      [45, 1, 1],
    ]);
  });

  it('without the stream length, percent and end breaks are left out; a failed VAST gives no ads', async () => {
    const http = new FakeHttp()
      .on(VMAP, { body: vmap('pre-mid-post.xml') })
      .on('https://ads.test/pre.xml', { status: 404, body: '' })
      .on('https://ads.test/mid1.xml', { body: INLINE })
      .on('https://ads.test/mid2.xml', { body: INLINE })
      .on('https://ads.test/post.xml', { body: INLINE });
    const ads = await loadStitchedAds(VMAP, { http, clock: new FakeClock() }, NaN);
    expect(ads.map((a) => a.start)).toEqual([90.5]);
  });

  it('every ad of a VAST pod is placed, one after another', async () => {
    const POD = readFileSync(`${__dirname}/../../fixtures/vast/pod-cat.xml`, 'utf8');
    const http = new FakeHttp()
      .on(VMAP, { body: vmap('pre-mid-post.xml') })
      .on('https://ads.test/mid1.xml', { body: POD });
    const ads = await loadStitchedAds(VMAP, { http, clock: new FakeClock() }, NaN);
    expect(ads.map((a) => [a.start, a.index, a.count])).toEqual([
      [90.5, 1, 2],
      [100.5, 2, 2],
    ]);
  });

  it('a break gets the ads the client player would play: one where the VMAP allows one, a pod in sequence order, one ad of a response without sequence numbers', async () => {
    const POD = readFileSync(`${__dirname}/../../fixtures/vast/pod-cat.xml`, 'utf8');
    const reversed = POD.replace('sequence="1"', 'sequence="X"')
      .replace('sequence="2"', 'sequence="1"')
      .replace('sequence="X"', 'sequence="2"');
    const unsequenced = POD.replace(/ sequence="\d"/g, '');
    const http = new FakeHttp()
      .on(VMAP, { body: vmap('pre-mid-post.xml') }) // pre and post: allowMultipleAds="false"
      .on('https://ads.test/pre.xml', { body: POD })
      .on('https://ads.test/mid1.xml', { body: reversed })
      .on('https://ads.test/mid2.xml', { body: unsequenced })
      .on('https://ads.test/post.xml', { body: INLINE });
    const ads = await loadStitchedAds(VMAP, { http, clock: new FakeClock() }, 600);
    expect(ads.map((a) => [a.start, a.ad.ad.id, a.index, a.count])).toEqual([
      [0, 'car', 1, 1],
      [90.5, 'coffee', 1, 2],
      [100.5, 'car', 2, 2],
      [300, 'car', 1, 1],
      [590, 'ad-1', 1, 1],
    ]);
  });

  it('the breaks load once and can be placed again for another stream length', async () => {
    const http = new FakeHttp()
      .on(VMAP, { body: vmap('pre-mid-post.xml') })
      .on('https://ads.test/pre.xml', { body: INLINE })
      .on('https://ads.test/mid1.xml', { body: INLINE })
      .on('https://ads.test/mid2.xml', { body: INLINE })
      .on('https://ads.test/post.xml', { body: INLINE });
    const breaks = await loadStitchedBreaks(VMAP, { http, clock: new FakeClock() });
    expect(placeStitchedBreaks(breaks, NaN).map((a) => a.start)).toEqual([0, 90.5]);
    expect(placeStitchedBreaks(breaks, 600).map((a) => a.start)).toEqual([0, 90.5, 300, 590]);
  });

  it('a VMAP that cannot be loaded gives no ads', async () => {
    const http = new FakeHttp().on(VMAP, { status: 500, body: '' });
    expect(await loadStitchedAds(VMAP, { http, clock: new FakeClock() }, 600)).toEqual([]);
  });
});
