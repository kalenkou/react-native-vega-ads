import { readFileSync } from 'fs';
import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet, Text, View } from 'react-native';
import { FakeClock } from '../../core/test/fakes/FakeClock';
import { FakeHttp } from '../../core/test/fakes/FakeHttp';
import { FakePlayer } from '../../core/test/fakes/FakePlayer';
import { AdOverlay } from '../src/AdOverlay';
import { VegaAdsPlayer, VegaAdsPlayerProps } from '../src/VegaAdsPlayer';
import { FakeW3cPlayer } from './fakes/FakeW3cPlayer';

const inline = readFileSync(`${__dirname}/../../core/fixtures/vast/inline.xml`, 'utf8');
const TAG = 'https://ads.test/pre.xml?lat=[LIMITADTRACKING]';

const g = globalThis as Record<string, unknown>;
beforeEach(() => {
  g.window = g;
  delete g.Image;
});
afterEach(() => {
  delete g.window;
  delete g.Image;
});

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
}

function setup(props: Partial<VegaAdsPlayerProps> = {}) {
  const http = new FakeHttp().on('https://ads.test/pre.xml?lat=1', { body: inline }).on('https://ads.test/pre.xml?lat=0', { body: inline });
  const players: FakeW3cPlayer[] = [];
  const base: VegaAdsPlayerProps = {
    source: { uri: 'https://cdn.test/movie.mp4' },
    ads: { breaks: [{ offset: 'start', vastUrl: TAG }] },
    http,
    clock: new FakeClock(1_000_000),
    componentInstance: () => ({ name: 'main' }),
    createVideoPlayer: () => {
      const player = new FakeW3cPlayer(players.length === 0 ? 600 : 10);
      players.push(player);
      return player;
    },
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<VegaAdsPlayer {...base} {...props} />);
  });
  /** The three KeplerVideoSurfaceViews report their surfaces, as on the device. */
  const surfacesReady = (): void => {
    const views = renderer.root.findAll((node) => (node.type as unknown) === 'KeplerVideoSurfaceView');
    act(() => views.forEach((view, index) => (view.props.onSurfaceViewCreated as (h: string) => void)(`s${index}`)));
  };
  return { http, players, renderer, surfacesReady };
}

describe('VegaAdsPlayer', () => {
  it('creates the content player, draws the surfaces and loads the pre-roll on its own', async () => {
    const ctx = setup();
    await settle();
    ctx.surfacesReady();
    await settle();
    expect(ctx.players[0]?.src).toBe('https://cdn.test/movie.mp4');
    expect(ctx.players[0]?.autoplay).toBe(false);
    expect(ctx.http.requests.some((url) => url.startsWith('https://ads.test/pre.xml'))).toBe(true);
  });

  it('fills the advertising ID macros from AdIdRetriever (user opted out: LIMITADTRACKING=1)', async () => {
    const adId = { isAdvertisingTrackingEnabled: () => false, fetchAdvertisingId: () => 'secret-id' };
    const ctx = setup({ adId });
    await settle();
    ctx.surfacesReady();
    await settle();
    expect(ctx.http.requests).toContain('https://ads.test/pre.xml?lat=1');
    expect(ctx.http.requests.join(' ')).not.toContain('secret-id');
  });

  it('calls onEnd when the content has ended and there is no post-roll', async () => {
    const onEnd = jest.fn();
    const ctx = setup({ ads: { breaks: [] }, onEnd });
    await settle();
    ctx.surfacesReady();
    await settle();
    act(() => ctx.players[0]?.emit('ended'));
    await settle();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('releases the content player when the screen closes', async () => {
    const ctx = setup();
    await settle();
    act(() => ctx.renderer.unmount());
    await settle();
    expect(ctx.players[0]?.deinitialized).toBe(true);
  });
});

describe('VegaAdsPlayer – customising', () => {
  it('plays through the app\'s own player and leaves it to the app', async () => {
    const own = new FakeW3cPlayer(600);
    await own.initialize();
    own.autoplay = false;
    own.src = 'https://cdn.test/own.mp4';
    const ctx = setup({ source: undefined, player: own });
    await settle();
    ctx.surfacesReady();
    await settle();
    expect(ctx.players.every((p) => p !== own)).toBe(true);
    expect(ctx.players[0]?.src).not.toBe('https://cdn.test/movie.mp4'); // no content player was created
    expect(own.calls).toContain('surface:s0');
    act(() => ctx.renderer.unmount());
    await settle();
    expect(own.deinitialized).toBe(false);
  });

  it('draws the app\'s own controls with the player and the ad state', async () => {
    const seen: Array<{ hasPlayer: boolean; playing: boolean }> = [];
    const ctx = setup({
      children: ({ player, ads }) => {
        seen.push({ hasPlayer: player !== null, playing: ads.playing });
        return <View testID="my-controls" />;
      },
    });
    await settle();
    expect(ctx.renderer.root.findAllByProps({ testID: 'my-controls' }).length).toBeGreaterThan(0);
    expect(seen.some((s) => s.hasPlayer)).toBe(true);
  });

  it('plays through any PlayerPort (react-native-video v7 via rnvPlayerPort): the app draws the content', async () => {
    const port = new FakePlayer({ duration: 600 });
    await port.initialize();
    const seen: Array<unknown> = [];
    const ctx = setup({
      source: undefined,
      player: port,
      children: ({ player }) => {
        seen.push(player);
        return null;
      },
    });
    await settle();
    const views = ctx.renderer.root.findAll((node) => (node.type as unknown) === 'KeplerVideoSurfaceView');
    expect(views).toHaveLength(2); // the two ad surfaces; <VideoView> of the app shows the content
    ctx.surfacesReady();
    await settle();
    expect(ctx.http.requests.some((url) => url.startsWith('https://ads.test/pre.xml'))).toBe(true);
    expect(ctx.players.every((p) => p.src !== 'https://cdn.test/movie.mp4')).toBe(true);
    expect(seen.every((player) => player === null)).toBe(true);
  });

  it('adds only the ad surfaces when the app draws the content surface itself', async () => {
    const ctx = setup({ contentSurface: false });
    await settle();
    const views = ctx.renderer.root.findAll((node) => (node.type as unknown) === 'KeplerVideoSurfaceView');
    expect(views).toHaveLength(2);
    ctx.surfacesReady();
    await settle();
    expect(ctx.http.requests.some((url) => url.startsWith('https://ads.test/pre.xml'))).toBe(true);
  });

  it('draws the app\'s own ad overlay instead of the default one', async () => {
    const ctx = setup({ renderOverlay: (ads) => <Text testID="my-overlay">{ads.ui.label}</Text> });
    await settle();
    expect(ctx.renderer.root.findAllByProps({ testID: 'my-overlay' }).length).toBeGreaterThan(0);
    expect(ctx.renderer.root.findAllByProps({ testID: 'vega-ads-focus' })).toHaveLength(0);
  });

  it('passes showWhy on to the default ad overlay', async () => {
    const overlay = async (props: Partial<VegaAdsPlayerProps>) => {
      const ctx = setup(props);
      await settle();
      return ctx.renderer.root.findAll((node) => node.type === AdOverlay)[0]?.props.showWhy;
    };
    expect(await overlay({})).toBe(false);
    expect(await overlay({ showWhy: true })).toBe(true);
  });

  it('shows "Ad in N" before a mid-roll; countdown={false} leaves it to the app', async () => {
    const MID = 'https://ads.test/mid.xml';
    const run = async (props: Partial<VegaAdsPlayerProps>): Promise<string[]> => {
      const ctx = setup({ ads: { breaks: [{ offset: 30, vastUrl: MID }] }, ...props });
      ctx.http.on(MID, { body: inline });
      ctx.surfacesReady();
      await settle();
      const content = ctx.players[0] as FakeW3cPlayer;
      const at = async (time: number): Promise<void> => {
        act(() => {
          content.currentTime = time;
          content.emit('timeupdate');
        });
        await settle();
      };
      await at(15);
      act(() => ctx.players[ctx.players.length - 1]?.emit('canplay'));
      await settle();
      await at(27);
      return ctx.renderer.root.findAll((n) => (n.type as unknown) === 'Text').map((n) => String(n.props.children));
    };
    expect(await run({})).toContain('Ad in 3');
    expect(await run({ countdown: false })).not.toContain('Ad in 3');
  });

  it('draws the pause ad when the viewer pauses the content', async () => {
    const PAUSE = 'https://ads.test/pause.xml';
    const clock = new FakeClock(1_000_000);
    const ctx = setup({ ads: { breaks: [] }, pauseAdUrl: PAUSE, clock });
    ctx.http.on(PAUSE, { body: readFileSync(`${__dirname}/../../core/fixtures/vast/pause.xml`, 'utf8') });
    ctx.surfacesReady();
    await settle();
    act(() => {
      ctx.players[0]?.emit('pause');
      clock.advance(1_500);
    });
    await settle();
    const images = ctx.renderer.root.findAll((n) => (n.type as unknown) === 'Image');
    expect(images.map((i) => i.props.source.uri)).toContain('https://cdn.test/pause.png');
  });

  it('places the pause ad where the app asks, clear of its controls', async () => {
    const PAUSE = 'https://ads.test/pause.xml';
    const clock = new FakeClock(1_000_000);
    const ctx = setup({ ads: { breaks: [] }, pauseAdUrl: PAUSE, pauseAdStyle: { bottom: 200 }, clock });
    ctx.http.on(PAUSE, { body: readFileSync(`${__dirname}/../../core/fixtures/vast/pause.xml`, 'utf8') });
    ctx.surfacesReady();
    await settle();
    act(() => {
      ctx.players[0]?.emit('pause');
      clock.advance(1_500);
    });
    await settle();
    const card = ctx.renderer.root.findAll((n) => (n.type as unknown) === 'View' && n.props.pointerEvents === 'none');
    expect(card.map((n) => StyleSheet.flatten(n.props.style))).toContainEqual(expect.objectContaining({ position: 'absolute', bottom: 200 }));
  });
});
