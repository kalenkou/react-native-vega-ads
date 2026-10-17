import { useEffect, useMemo, useRef, useState } from 'react';
import {
  installImagePolyfill,
  loadStitchedAds,
  StitchedAdTracker,
  type ClockPort,
  type HttpPort,
  type Macros,
  type PlayerPort,
  type StitchedAdState,
} from 'react-native-ads-core';
import { W3cPlayerAdapter, type W3cVideoPlayer } from './W3cPlayerAdapter';
import { isPlayerPort } from './useVegaAds';
import { fetchHttp, systemClock } from './platform';

export interface UseStitchedAdsOptions {
  /** The VMAP of a stream that already contains its ads (server-side ad insertion). */
  vmapUrl: string | null;
  /** The player of that stream: a w3cmedia `VideoPlayer` or any `PlayerPort`. */
  player: W3cVideoPlayer | PlayerPort | null;
  /** Stream length in seconds, ads included; needed for `n%` and `end` breaks. NaN if unknown. */
  streamSeconds: number;
  macros?: Macros;
  /** IAB event names after their pixels are sent: impression, start, quartiles, complete, skip. */
  onEvent?: (name: string) => void;
  http?: HttpPort;
  clock?: ClockPort;
}

export interface StitchedAds {
  /** The stitched ad on screen, for the ad label; null during the content. */
  ad: StitchedAdState | null;
  /** Seeks past the ad when skipping is allowed; does nothing before. */
  skip: () => void;
}

const same = (a: StitchedAdState | null, b: StitchedAdState | null): boolean =>
  a === b || (a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b));

/**
 * Tracking-only ads for a stitched stream: the player never switches, the content time says
 * which ad plays, and the IAB pixels go out as for client-side ads.
 */
export function useStitchedAds(options: UseStitchedAdsOptions): StitchedAds {
  const { vmapUrl, player, streamSeconds } = options;
  const latest = useRef(options);
  latest.current = options;
  const [ad, setAd] = useState<StitchedAdState | null>(null);
  const tracker = useRef<StitchedAdTracker | null>(null);
  const port = useMemo<PlayerPort | null>(
    () => (player === null ? null : isPlayerPort(player) ? player : new W3cPlayerAdapter(player, () => undefined)),
    [player],
  );

  useEffect(() => {
    if (vmapUrl === null || port === null) {
      return undefined;
    }
    const { http = fetchHttp, clock = systemClock, macros } = latest.current;
    installImagePolyfill(http);
    let live = true;
    const offs: Array<() => void> = [];
    void loadStitchedAds(vmapUrl, { http, clock, macros }, streamSeconds).then((ads) => {
      if (!live) return;
      const created = new StitchedAdTracker(ads, { macros, onEvent: (name) => latest.current.onEvent?.(name) });
      tracker.current = created;
      const show = (): void => setAd((before) => {
        const now = created.current();
        return same(before, now) ? before : now;
      });
      offs.push(
        port.on('timeupdate', () => {
          created.update(port.getCurrentTime());
          show();
        }),
        port.on('pause', () => created.paused()),
        port.on('playing', () => created.resumed()),
      );
    });
    return () => {
      live = false;
      offs.forEach((off) => off());
      tracker.current = null;
      setAd(null);
    };
  }, [vmapUrl, port, streamSeconds]);

  return {
    ad,
    skip: () => {
      const target = tracker.current?.skip() ?? null;
      if (target !== null && port !== null) {
        port.setCurrentTime(target);
        setAd(null);
      }
    },
  };
}
