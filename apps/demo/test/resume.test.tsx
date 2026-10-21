import React from 'react';
import {AppState} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import type {W3cVideoPlayer} from 'react-native-vega-ads';

jest.mock('@amazon-devices/react-native-async-storage__async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

import {resumeStore, useSaveResume, type ResumeStorage} from '../src/resume';

function memoryStorage(): ResumeStorage & {data: Map<string, string>} {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
  };
}

class FakePlayer {
  currentTime = 0;
  private listeners = new Map<string, Set<() => void>>();
  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  playTo(seconds: number): void {
    this.currentTime = seconds;
    this.listeners.get('timeupdate')?.forEach((listener) => listener());
  }
}

const URI = 'http://media.test/tears.mov';
const OTHER = 'http://media.test/sintel.mp4';

describe('resumeStore', () => {
  it('keeps a position per movie and forgets it on clear', async () => {
    const store = resumeStore(memoryStorage());
    expect(await store.read(URI)).toBeNull();
    await store.save(URI, 11.4);
    await store.save(OTHER, 300);
    expect(await store.read(URI)).toBe(11.4);
    await store.clear(URI);
    expect(await store.read(URI)).toBeNull();
    expect(await store.read(OTHER)).toBe(300);
  });

  it('reads nothing from a broken value', async () => {
    const storage = memoryStorage();
    storage.data.set('vega-ads-demo.resume', '{not json');
    expect(await resumeStore(storage).read(URI)).toBeNull();
  });

  it('starts over from a value that is not a map', async () => {
    const storage = memoryStorage();
    storage.data.set('vega-ads-demo.resume', 'null');
    const store = resumeStore(storage);
    expect(await store.read(URI)).toBeNull();
    await store.save(URI, 8);
    expect(await store.read(URI)).toBe(8);
  });

  /** Storage that answers reads only when the test says so, in the given order. */
  function slowStorage() {
    const storage = memoryStorage();
    const reads: Array<() => void> = [];
    return {
      ...storage,
      getItem: (key: string) =>
        new Promise<string | null>((resolve) => {
          reads.push(() => resolve(storage.data.get(key) ?? null));
        }),
      async answerAll(order: 'newest first' | 'oldest first') {
        const tick = () =>
          new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
        await tick();
        while (reads.length > 0) {
          (order === 'newest first' ? reads.pop() : reads.shift())?.();
          await tick();
        }
      },
    };
  }

  it('a save still in flight does not bring back a position cleared after it', async () => {
    const storage = slowStorage();
    const store = resumeStore(storage);
    const saving = store.save(URI, 12);
    const clearing = store.clear(URI);
    await storage.answerAll('newest first');
    await Promise.all([saving, clearing]);
    expect(storage.data.get('vega-ads-demo.resume')).toBe('{}');
  });

  it('a read waits for the save before it', async () => {
    const storage = slowStorage();
    const store = resumeStore(storage);
    const saving = store.save(URI, 8);
    const reading = store.read(URI);
    await storage.answerAll('oldest first');
    await saving;
    expect(await reading).toBe(8);
  });

  it('goes on after a write fails', async () => {
    const storage = memoryStorage();
    const store = resumeStore({
      getItem: storage.getItem,
      setItem: jest
        .fn()
        .mockRejectedValueOnce(new Error('disk full'))
        .mockImplementation(storage.setItem),
    });
    await expect(store.save(URI, 5)).rejects.toThrow('disk full');
    await store.save(URI, 9);
    expect(await store.read(URI)).toBe(9);
  });
});

describe('useSaveResume', () => {
  let appStateListener: (state: string) => void = () => undefined;
  const remove = jest.fn();

  beforeEach(() => {
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, listener) => {
        appStateListener = listener as (state: string) => void;
        return {remove} as never;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function setup(adsPlaying = false) {
    const saves: Array<[string, number]> = [];
    const store = {
      save: async (uri: string, at: number) => {
        saves.push([uri, at]);
      },
    };
    const player = new FakePlayer();
    const Probe = ({playing}: {playing: boolean}) => {
      useSaveResume(player as unknown as W3cVideoPlayer, playing, URI, store);
      return null;
    };
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Probe playing={adsPlaying} />);
    });
    return {saves, player, renderer, Probe};
  }

  it('saves the movie position every 5 s of playback', () => {
    const {saves, player} = setup();
    act(() => player.playTo(1));
    act(() => player.playTo(4.9));
    act(() => player.playTo(5.2));
    act(() => player.playTo(9));
    act(() => player.playTo(10.3));
    expect(saves).toEqual([
      [URI, 5.2],
      [URI, 10.3],
    ]);
  });

  it('saves the last position at once when the app goes to the background', () => {
    const {saves, player} = setup();
    act(() => player.playTo(3.5));
    expect(saves).toEqual([]);
    act(() => appStateListener('background'));
    expect(saves).toEqual([[URI, 3.5]]);
  });

  it('saves nothing while an ad plays', () => {
    const {saves, player} = setup(true);
    act(() => player.playTo(12));
    act(() => appStateListener('background'));
    expect(saves).toEqual([]);
  });

  it('stops listening when the screen closes', () => {
    const {saves, player, renderer} = setup();
    act(() => renderer.unmount());
    act(() => player.playTo(20));
    expect(saves).toEqual([]);
    expect(remove).toHaveBeenCalled();
  });
});
