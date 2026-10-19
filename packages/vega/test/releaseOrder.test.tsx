import TestRenderer, { act, ReactTestInstance } from 'react-test-renderer';
import { DualSurfaceView } from '../src/DualSurfaceView';
import { useVideoPlayer } from '../src/useVideoPlayer';
import type { AdSurfaces } from '../src/useVegaAds';
import type { W3cVideoPlayer } from '../src/W3cPlayerAdapter';
import { FakeW3cPlayer } from './fakes/FakeW3cPlayer';
import * as keplerModule from '@amazon-devices/react-native-kepler';

const kepler = keplerModule as unknown as { emitAppState(state: string): void };

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

const surfaces: AdSurfaces = {
  shown: null,
  onAdSurface: () => undefined,
  onStandbySurface: () => undefined,
  onContentSurface: () => undefined,
};

function Screen({ uri, create }: { uri: string; create: () => W3cVideoPlayer }): JSX.Element {
  const player = useVideoPlayer(uri, { createVideoPlayer: create });
  return <DualSurfaceView surfaces={surfaces} contentPlayer={player} />;
}

async function setup() {
  const players: FakeW3cPlayer[] = [];
  const create = (): W3cVideoPlayer => {
    const player = new FakeW3cPlayer(600);
    players.push(player);
    return player;
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Screen uri="https://cdn.test/a.mp4" create={create} />);
  });
  const content = renderer.root
    .find((n) => n.props.testID === 'vega-ads-content' && (n.type as unknown) === 'View')
    .find((n) => (n.type as unknown) === 'KeplerVideoSurfaceView') as ReactTestInstance;
  act(() => content.props.onSurfaceViewCreated('c1'));
  await settle();
  const releaseCalls = (player: FakeW3cPlayer): string[] =>
    player.calls.filter((call) => call.startsWith('clear:') || call === 'deinitialize');
  return { players, renderer, create, releaseCalls };
}

// Amazon's release order for a w3cmedia player: clear its surface, then deinitialize().
describe('content player release order with DualSurfaceView', () => {
  it('clears the surface before deinitialize() when the app goes to the background', async () => {
    const ctx = await setup();
    expect(ctx.players[0]?.calls).toContain('surface:c1');
    act(() => kepler.emitAppState('background'));
    await settle();
    expect(ctx.releaseCalls(ctx.players[0] as FakeW3cPlayer)).toEqual(['clear:c1', 'deinitialize']);
  });

  it('clears the surface before deinitialize() when the screen closes', async () => {
    const ctx = await setup();
    act(() => ctx.renderer.unmount());
    await settle();
    expect(ctx.releaseCalls(ctx.players[0] as FakeW3cPlayer)).toEqual(['clear:c1', 'deinitialize']);
  });

  it('clears the surface of the old player before deinitialize() when the source changes', async () => {
    const ctx = await setup();
    act(() => ctx.renderer.update(<Screen uri="https://cdn.test/b.mp4" create={ctx.create} />));
    await settle();
    expect(ctx.releaseCalls(ctx.players[0] as FakeW3cPlayer)).toEqual(['clear:c1', 'deinitialize']);
    expect(ctx.players[1]?.calls).toContain('surface:c1');
  });
});
