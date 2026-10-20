import {useEffect, useRef} from 'react';
import {AppState} from 'react-native';
import AsyncStorage from '@amazon-devices/react-native-async-storage__async-storage';
import type {W3cVideoPlayer} from 'react-native-vega-ads';

export interface ResumeStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const KEY = 'vega-ads-demo.resume';
/** Save at most every 5 s of the movie. */
const EVERY = 5;

/**
 * Where the viewer was in each movie, kept on the device. The app releases its players in the
 * background, but the system can still end the app before they are closed. Then the movie page
 * offers to continue from here.
 */
export function resumeStore(storage: ResumeStorage = AsyncStorage) {
  const readAll = async (): Promise<Record<string, number>> => {
    try {
      const value = JSON.parse((await storage.getItem(KEY)) ?? '{}');
      return value !== null && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  };
  const update = async (change: (all: Record<string, number>) => void) => {
    const all = await readAll();
    change(all);
    await storage.setItem(KEY, JSON.stringify(all));
  };
  return {
    read: async (uri: string): Promise<number | null> => {
      const at = (await readAll())[uri];
      return typeof at === 'number' && at > 0 ? at : null;
    },
    save: (uri: string, at: number) =>
      update((all) => {
        all[uri] = at;
      }),
    clear: (uri: string) =>
      update((all) => {
        delete all[uri];
      }),
  };
}

/** On this device. */
export const deviceResume = resumeStore();

/** Saves the movie position while it plays (not during ads), and at once in the background. */
export function useSaveResume(
  player: W3cVideoPlayer | null,
  adsPlaying: boolean,
  uri: string,
  store: {save(uri: string, at: number): Promise<void>},
): void {
  const position = useRef(0);
  const saved = useRef(0);
  const latest = useRef({adsPlaying, uri, store});
  latest.current = {adsPlaying, uri, store};

  const save = () => {
    const {adsPlaying: ad, uri: movie, store: target} = latest.current;
    if (ad || position.current <= 0) {
      return;
    }
    saved.current = position.current;
    target.save(movie, position.current).catch(() => undefined);
  };

  useEffect(() => {
    if (!player) {
      return undefined;
    }
    const onTime = () => {
      position.current = player.currentTime;
      if (Math.abs(position.current - saved.current) >= EVERY) {
        save();
      }
    };
    player.addEventListener('timeupdate', onTime);
    return () => player.removeEventListener('timeupdate', onTime);
  }, [player]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        save();
      }
    });
    return () => subscription.remove();
  }, []);
}
