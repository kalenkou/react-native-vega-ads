import { readFileSync } from 'fs';
import TestRenderer, { act } from 'react-test-renderer';
import { FakeClock } from '../../core/test/fakes/FakeClock';
import { FakeHttp } from '../../core/test/fakes/FakeHttp';
import { useStitchedAds, StitchedAds, UseStitchedAdsOptions } from '../src/useStitchedAds';
import { W3cPlayerAdapter } from '../src/W3cPlayerAdapter';
import { FakeW3cPlayer } from './fakes/FakeW3cPlayer';

const VMAP_URL = 'https://ads.test/vmap.xml';
const fixture = (path: string) => readFileSync(`${__dirname}/../../core/fixtures/${path}`, 'utf8');
const INLINE = fixture('vast/inline.xml');

const g = globalThis as Record<string, unknown>;
beforeEach(() => {
  g.window = g;
  delete g.Image;
});
afterEach(() => {
  delete g.window;
  delete g.Image;
});

function Harness({ options, out }: { options: UseStitchedAdsOptions; out: { current: StitchedAds | null } }): null {
  out.current = useStitchedAds(options);
  return null;
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
}

/** A 600 s stitched stream: a 10 s ad at 0 and one at 90.5 s (pre-mid-post.xml with two VASTs). */
async function setup(overrides: Partial<UseStitchedAdsOptions> = {}) {
  const http = new FakeHttp()
    .on(VMAP_URL, { body: fixture('vmap/pre-mid-post.xml') })
    .on('https://ads.test/pre.xml', { body: INLINE })
    .on('https://ads.test/mid1.xml', { body: INLINE.replace('<Linear>', '<Linear skipoffset="00:00:05">') });
  const player = new FakeW3cPlayer(600);
  const events: string[] = [];
  const out: { current: StitchedAds | null } = { current: null };
  const options: UseStitchedAdsOptions = {
    vmapUrl: VMAP_URL,
    player,
    streamSeconds: NaN,
    http,
    clock: new FakeClock(),
    onEvent: (name) => events.push(name),
    ...overrides,
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Harness options={options} out={out} />);
  });
  await settle();
  const at = (seconds: number) =>
    act(() => {
      player.currentTime = seconds;
      player.emit('timeupdate');
    });
  const play = (from: number, to: number) => {
    for (let t = from; t <= to + 1e-9; t += 0.5) at(Number(t.toFixed(2)));
  };
  return { http, player, events, out, renderer, at, play, ads: () => out.current as StitchedAds };
}

it('tracks the stitched ads as the player plays and shows which ad is on', async () => {
  const { events, play, ads, renderer } = await setup();
  play(0, 4);
  expect(ads().ad).toEqual({ index: 1, count: 1, remaining: 6, secondsUntilSkip: null });
  play(4.5, 12);
  expect(ads().ad).toBeNull();
  expect(events).toEqual(['impression', 'start', 'firstQuartile', 'midpoint', 'thirdQuartile', 'complete']);
  act(() => renderer.unmount());
});

it('pause and play of the player during an ad are tracked', async () => {
  const { events, play, player, renderer } = await setup();
  play(0, 1);
  act(() => player.emit('pause'));
  act(() => player.emit('playing'));
  expect(events.slice(-2)).toEqual(['pause', 'resume']);
  act(() => renderer.unmount());
});

it('skip seeks the player to the end of the ad once it is allowed', async () => {
  const { events, play, player, ads, renderer } = await setup();
  play(89, 93);
  act(() => ads().skip());
  expect(player.currentTime).toBe(93);
  play(93.5, 96);
  act(() => ads().skip());
  expect(player.currentTime).toBe(100.5);
  expect(events.slice(-1)).toEqual(['skip']);
  act(() => renderer.unmount());
});

it('works with any PlayerPort, and stops listening on unmount', async () => {
  const w3c = new FakeW3cPlayer(600);
  const { events, renderer } = await setup({ player: new W3cPlayerAdapter(w3c, () => ({})) });
  act(() => {
    w3c.currentTime = 0;
    w3c.emit('timeupdate');
  });
  expect(events).toEqual(['impression']);
  act(() => renderer.unmount());
  act(() => {
    w3c.currentTime = 1;
    w3c.emit('timeupdate');
  });
  expect(events).toEqual(['impression']);
});

it('an unmount before the VMAP arrives leaves the player alone', async () => {
  const http = new FakeHttp()
    .on(VMAP_URL, { body: fixture('vmap/pre-mid-post.xml') })
    .on('https://ads.test/pre.xml', { body: INLINE });
  const player = new FakeW3cPlayer(600);
  const events: string[] = [];
  const out: { current: StitchedAds | null } = { current: null };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Harness
        options={{ vmapUrl: VMAP_URL, player, streamSeconds: NaN, http, clock: new FakeClock(), onEvent: (n) => events.push(n) }}
        out={out}
      />,
    );
  });
  act(() => renderer.unmount());
  await settle();
  act(() => {
    player.currentTime = 0;
    player.emit('timeupdate');
  });
  expect(events).toEqual([]);
});
