import TestRenderer, { act } from 'react-test-renderer';
import { useVideoPlayer } from '../src/useVideoPlayer';
import type { W3cVideoPlayer } from '../src/W3cPlayerAdapter';
import { FakeW3cPlayer } from './fakes/FakeW3cPlayer';

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

function Harness({ uri, create, out }: { uri: string | null; create: () => W3cVideoPlayer; out: { current: W3cVideoPlayer | null } }): null {
  out.current = useVideoPlayer(uri, { createVideoPlayer: create });
  return null;
}

function setup(uri: string | null = 'https://cdn.test/movie.mp4') {
  const players: FakeW3cPlayer[] = [];
  const create = (): W3cVideoPlayer => {
    const player = new FakeW3cPlayer(600);
    players.push(player);
    return player;
  };
  const out: { current: W3cVideoPlayer | null } = { current: null };
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

  it('creates nothing while the source is null', async () => {
    const ctx = setup(null);
    await settle();
    expect(ctx.players).toHaveLength(0);
    expect(ctx.out.current).toBeNull();
  });
});
