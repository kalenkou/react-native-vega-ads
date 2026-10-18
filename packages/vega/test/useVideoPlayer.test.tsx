import TestRenderer, { act } from 'react-test-renderer';
import { useVideoPlayer } from '../src/useVideoPlayer';
import type { W3cVideoPlayer } from '../src/W3cPlayerAdapter';
import { FakeW3cPlayer } from './fakes/FakeW3cPlayer';
import * as keplerModule from '@amazon-devices/react-native-kepler';

const kepler = keplerModule as unknown as { emitAppState(state: string): void };

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

function Harness({
  uri,
  create,
  out,
}: {
  uri: string | null;
  create: () => W3cVideoPlayer;
  out: { current: W3cVideoPlayer | null; released?: number[] };
}): null {
  out.current = useVideoPlayer(uri, { createVideoPlayer: create, onRelease: (at) => out.released?.push(at) });
  return null;
}

function setup(uri: string | null = 'https://cdn.test/movie.mp4') {
  const players: FakeW3cPlayer[] = [];
  const create = (): W3cVideoPlayer => {
    const player = new FakeW3cPlayer(600);
    players.push(player);
    return player;
  };
  const out: { current: W3cVideoPlayer | null; released: number[] } = { current: null, released: [] };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Harness uri={uri} create={create} out={out} />);
  });
  const rerender = (next: string | null): void => {
    act(() => renderer.update(<Harness uri={next} create={create} out={out} />));
  };
  return { players, out, renderer, rerender };
}

describe('useVideoPlayer', () => {
  it('gives the player only after initialize, with autoplay off and the source set', async () => {
    const ctx = setup();
    expect(ctx.out.current).toBeNull();
    await settle();
    const player = ctx.players[0] as FakeW3cPlayer;
    expect(ctx.out.current).toBe(player);
    expect(player.autoplay).toBe(false);
    expect(player.src).toBe('https://cdn.test/movie.mp4');
  });

  it('releases the player on unmount', async () => {
    const ctx = setup();
    await settle();
    act(() => ctx.renderer.unmount());
    await settle();
    expect(ctx.players[0]?.deinitialized).toBe(true);
  });

  it('releases a player whose screen closed before it was ready, and never returns it', async () => {
    const ctx = setup();
    act(() => ctx.renderer.unmount());
    await settle();
    expect(ctx.players[0]?.deinitialized).toBe(true);
    expect(ctx.out.current).toBeNull();
  });

  it('a new source gets a new player and releases the old one', async () => {
    const ctx = setup();
    await settle();
    ctx.rerender('https://cdn.test/next.mp4');
    expect(ctx.out.current).toBeNull();
    await settle();
    expect(ctx.players[0]?.deinitialized).toBe(true);
    expect(ctx.out.current).toBe(ctx.players[1]);
    expect(ctx.players[1]?.src).toBe('https://cdn.test/next.mp4');
  });

  it('keeps one player while the screen re-renders with the same source, even with a new create function', async () => {
    const ctx = setup();
    await settle();
    for (let i = 0; i < 5; i++) {
      const create = (): W3cVideoPlayer => {
        const player = new FakeW3cPlayer(600);
        ctx.players.push(player);
        return player;
      };
      act(() => ctx.renderer.update(<Harness uri="https://cdn.test/movie.mp4" create={create} out={ctx.out} />));
      await settle();
    }
    expect(ctx.players).toHaveLength(1);
    expect(ctx.players[0]?.deinitialized).toBe(false);
    expect(ctx.out.current).toBe(ctx.players[0]);
  });

  it('releases the player in the background, as Amazon requires, and tells where the viewer was', async () => {
    const ctx = setup();
    await settle();
    (ctx.players[0] as FakeW3cPlayer).currentTime = 42;
    act(() => kepler.emitAppState('background'));
    await settle();
    expect(ctx.players[0]?.deinitialized).toBe(true);
    expect(ctx.out.current).toBeNull();
    expect(ctx.out.released).toEqual([42]);
  });

  it('releases the player in the background also when the app passes no onRelease', async () => {
    const players: FakeW3cPlayer[] = [];
    function Bare(): null {
      useVideoPlayer('https://cdn.test/movie.mp4', {
        createVideoPlayer: () => {
          const player = new FakeW3cPlayer(600);
          players.push(player);
          return player;
        },
      });
      return null;
    }
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Bare />);
    });
    await settle();
    act(() => kepler.emitAppState('background'));
    await settle();
    expect(players[0]?.deinitialized).toBe(true);
    act(() => renderer.unmount());
  });

  it('makes a new player for the same source when the app is back', async () => {
    const ctx = setup();
    await settle();
    act(() => kepler.emitAppState('background'));
    act(() => kepler.emitAppState('active'));
    await settle();
    expect(ctx.players).toHaveLength(2);
    expect(ctx.out.current).toBe(ctx.players[1]);
    expect(ctx.players[1]?.src).toBe('https://cdn.test/movie.mp4');
    expect(ctx.players[1]?.deinitialized).toBe(false);
  });

  it('keeps its player when the app becomes active without a background first', async () => {
    const ctx = setup();
    await settle();
    act(() => kepler.emitAppState('active'));
    await settle();
    expect(ctx.players).toHaveLength(1);
    expect(ctx.out.current).toBe(ctx.players[0]);
  });

  it('releases a player that was still starting when the app went to the background', async () => {
    const ctx = setup();
    act(() => kepler.emitAppState('background'));
    await settle();
    expect(ctx.players[0]?.deinitialized).toBe(true);
    expect(ctx.out.current).toBeNull();
    act(() => kepler.emitAppState('active'));
    await settle();
    expect(ctx.out.current).toBe(ctx.players[1]);
    act(() => ctx.renderer.unmount());
  });

  it('stops listening to the app state on unmount', async () => {
    const ctx = setup();
    await settle();
    act(() => ctx.renderer.unmount());
    act(() => kepler.emitAppState('background'));
    act(() => kepler.emitAppState('active'));
    await settle();
    expect(ctx.players).toHaveLength(1);
    expect(ctx.out.released).toEqual([]);
  });

  it('creates nothing while the source is null', async () => {
    const ctx = setup(null);
    await settle();
    expect(ctx.players).toHaveLength(0);
    expect(ctx.out.current).toBeNull();
  });
});
