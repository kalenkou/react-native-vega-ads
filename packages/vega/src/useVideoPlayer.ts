import { useEffect, useState } from 'react';
import { VideoPlayer } from '@amazon-devices/react-native-w3cmedia';
import type { W3cVideoPlayer } from './W3cPlayerAdapter';

export interface UseVideoPlayerOptions {
  /** For tests or a custom player; default `new VideoPlayer()` from w3cmedia. */
  createVideoPlayer?: () => W3cVideoPlayer;
}

export const newVideoPlayer = (): W3cVideoPlayer => new VideoPlayer() as unknown as W3cVideoPlayer;

/**
 * A w3cmedia content player for `uri`, ready for `useVegaAds`: initialized, `autoplay` off,
 * released on unmount or when `uri` changes. Null until it is ready, and while `uri` is null.
 */
export function useVideoPlayer(uri: string | null, options: UseVideoPlayerOptions = {}): W3cVideoPlayer | null {
  const [player, setPlayer] = useState<W3cVideoPlayer | null>(null);
  const create = options.createVideoPlayer ?? newVideoPlayer;

  useEffect(() => {
    if (!uri) {
      return undefined;
    }
    const created = create();
    let alive = true;
    void created
      .initialize()
      .then(() => {
        if (!alive) {
          return; // the screen closed or the source changed while the player was starting
        }
        created.autoplay = false;
        created.src = uri;
        setPlayer(created);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      setPlayer(null);
      void created.deinitialize().catch(() => undefined);
    };
    // `create` is read once per source on purpose: a new function each render must not reload the movie.
  }, [uri]);

  return player;
}
