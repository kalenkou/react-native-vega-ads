import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type AdEventHandler,
  installImagePolyfill,
  loadStitchedBreaks,
  placeStitchedBreaks,
  StitchedAdTracker,
  type ClockPort,
  type HttpPort,
  type Macros,
  type PlayerPort,
  type StitchedAdState,
  type StitchedBreak,
} from 'react-native-ads-core';
import { W3cPlayerAdapter, type W3cVideoPlayer } from './W3cPlayerAdapter';
import { isPlayerPort } from './useVegaAds';
import { fetchHttp, systemClock } from './platform';

export interface UseStitchedAdsOptions {
  /** The VMAP of a stream that already contains its ads (server-side ad insertion). */
  vmapUrl: string | null;
  /** The player of that stream: a w3cmedia `VideoPlayer` or any `PlayerPort`. */
  player: W3cVideoPlayer | PlayerPort | null;
  /**
   * Stream length in seconds, ads included; needed for `n%` and `end` breaks. Leave it out (or
   * NaN) while unknown, for example until the player has the duration: those breaks are placed
   * when it arrives, without loading the VMAP again.
   */
  streamSeconds?: number;
  macros?: Macros;
  /** IAB event names after their pixels are sent: impression, start, quartiles, complete, skip. `info` is `{}` in this preview. */
  onEvent?: AdEventHandler;
  http?: HttpPort;
  clock?: ClockPort;
}

export interface StitchedAds {
  /**
   * true once the VMAP and its VAST answers are loaded. Start the stream then: an ad is tracked
   * only when playback enters it at its start, so a pre-roll that played on while the schedule
   * loaded is not counted.
   */
  ready: boolean;
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
  const [ready, setReady] = useState(false);
  const tracker = useRef<StitchedAdTracker | null>(null);
  const breaks = useRef<readonly StitchedBreak[]>([]);
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
    void loadStitchedBreaks(vmapUrl, { http, clock, macros }).then((loaded) => {
      if (!live) return;
      const created = new StitchedAdTracker(placeStitchedBreaks(loaded, latest.current.streamSeconds ?? NaN), {
        macros,
        onEvent: (name) => latest.current.onEvent?.(name, {}),
      });
      breaks.current = loaded;
      tracker.current = created;
      setReady(true);
      const show = (): void =>
        setAd((before) => {
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
        port.on('ended', () => {
          created.streamEnded();
          show();
        }),
      );
    });
    return () => {
      live = false;
      offs.forEach((off) => off());
      tracker.current = null;
      breaks.current = [];
      setAd(null);
      setReady(false);
    };
  }, [vmapUrl, port]);

  useEffect(() => {
    tracker.current?.place(placeStitchedBreaks(breaks.current, streamSeconds ?? NaN));
  }, [streamSeconds]);

  return {
    ready,
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
