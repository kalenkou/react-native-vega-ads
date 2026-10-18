import { useEffect, useRef, useState } from 'react';
import { useKeplerAppStateManager } from '@amazon-devices/react-native-kepler';
import { VideoPlayer } from '@amazon-devices/react-native-w3cmedia';
import type { W3cVideoPlayer } from './W3cPlayerAdapter';

export interface UseVideoPlayerOptions {
  /** For tests or a custom player; default `new VideoPlayer()` from w3cmedia. */
  createVideoPlayer?: () => W3cVideoPlayer;
  /**
   * Called when the app goes to the background and the player is released, with the position the
   * viewer had. Pass it to `useVegaAds({ startAt })` to continue there when the app is back.
   */
  onRelease?: (position: number) => void;
}

export const newVideoPlayer = (): W3cVideoPlayer => new VideoPlayer() as unknown as W3cVideoPlayer;

/**
 * A w3cmedia content player for `uri`, ready for `useVegaAds`: initialized, `autoplay` off,
 * released on unmount or when `uri` changes. Null until it is ready, and while `uri` is null.
 *
 * Amazon requires an app to release its media players in the background, or the system ends the
 * app. So in the background the player is released and the hook gives null. Back in front it
 * gives a new player for the same `uri`.
 */
export function useVideoPlayer(uri: string | null, options: UseVideoPlayerOptions = {}): W3cVideoPlayer | null {
  const [player, setPlayer] = useState<W3cVideoPlayer | null>(null);
  const appStateNow = useKeplerAppStateManager();
  const appState = useRef(appStateNow);
  appState.current = appStateNow;
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (!uri) {
      return undefined;
    }
    // Read once per source on purpose: a new function each render must not reload the movie.
    const create = latest.current.createVideoPlayer ?? newVideoPlayer;
    let current: W3cVideoPlayer | null = null;
    const open = (): void => {
      const created = create();
      current = created;
      void created
        .initialize()
        .then(() => {
          if (current !== created) {
            return; // released while it was starting: the screen closed, the source changed or the app left
          }
          created.autoplay = false;
          created.src = uri;
          setPlayer(created);
        })
        .catch(() => undefined);
    };
    /** Releases the player and gives the position the viewer had. */
    const release = (): number => {
      const released = current;
      current = null;
      setPlayer(null);
      if (!released) {
        return 0;
      }
      const position = released.currentTime;
      void released.deinitialize().catch(() => undefined);
      return position;
    };
    open();
    const subscription = appState.current.addAppStateListener('change', (state) => {
      if (state === 'background' && current) {
        const position = release(); // before the callback: `onRelease?.(release())` would skip it without one
        latest.current.onRelease?.(position);
      } else if (state === 'active' && !current) {
        open();
      }
    });
    return () => {
      subscription.remove();
      release();
    };
  }, [uri]);

  return player;
}
