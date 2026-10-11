import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { useKeplerAppStateManager } from '@amazon-devices/react-native-kepler';
import { VideoPlayer } from '@amazon-devices/react-native-w3cmedia';
import {
  AdManager,
  AdSchedule,
  AdUiState,
  AdUiStrings,
  adUiState,
  ClockPort,
  HttpPort,
  IDLE_SNAPSHOT,
  installImagePolyfill,
  Macros,
  MediaFileOptions,
  SessionSnapshot,
} from '@vega-ads/core';
import { W3cPlayerAdapter, W3cVideoPlayer } from './W3cPlayerAdapter';
import { fetchHttp, systemClock } from './platform';

export interface UseVegaAdsOptions {
  /** A VMAP URL, or VAST tags with their times. `null` waits (for example, until the title is known). */
  source: AdSchedule | null;
  /**
   * Your content `VideoPlayer`, initialized, with `autoplay = false` and `src` set.
   * The hook starts it after the pre-roll, or at once when there is none.
   */
  contentPlayer: W3cVideoPlayer | null;
  /** Ad tag macros, for example from `adIdMacros()` (IFA, LIMITADTRACKING). */
  macros?: Macros;
  /** How early a break is loaded and buffered. Default 15 s. */
  prefetchSeconds?: number;
  mediaFile?: MediaFileOptions;
  /** Overlay texts; English by default. */
  strings?: Partial<AdUiStrings>;
  /** Back during an ad returns to the content (R23). Default true. */
  handleBack?: boolean;
  /** IAB events sent and errors, for logs and analytics. */
  onEvent?: (name: string) => void;
  /** Defaults to the app's own component instance (needed for remote and Alexa play/pause). */
  componentInstance?: () => unknown;
  /** For tests and other runtimes. */
  createVideoPlayer?: () => W3cVideoPlayer;
  http?: HttpPort;
  clock?: ClockPort;
}

/** What DualSurfaceView needs. */
export interface AdSurfaces {
  /** The ad surface to show on top of the content, or null between ads. */
  shown: string | null;
  onAdSurface: (handle: string | null) => void;
  onStandbySurface: (handle: string | null) => void;
}

export interface VegaAds {
  snapshot: SessionSnapshot;
  /** What AdOverlay shows. */
  ui: AdUiState;
  surfaces: AdSurfaces;
  /** Viewer pressed Skip. False when skipping is not allowed yet. */
  skip: () => boolean;
  /** Leave the ad break and go back to the content. */
  back: () => Promise<void>;
}

const newVideoPlayer = (): W3cVideoPlayer => new VideoPlayer() as unknown as W3cVideoPlayer;

/**
 * Client-side ads for one piece of content on Vega:
 *
 * ```tsx
 * const ads = useVegaAds({ source: { vmapUrl }, contentPlayer });
 * <DualSurfaceView surfaces={ads.surfaces} contentPlayer={contentPlayer} />
 * <AdOverlay ui={ads.ui} onSkip={ads.skip} />
 * ```
 */
export function useVegaAds(options: UseVegaAdsOptions): VegaAds {
  // The manager object may be new on every render; read it through a ref so it never restarts the ads.
  const appState = useRef(useKeplerAppStateManager());
  appState.current = useKeplerAppStateManager();
  const [adSurface, setAdSurface] = useState<string | null>(null);
  const [standbySurface, setStandbySurface] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(IDLE_SNAPSHOT);
  const manager = useRef<AdManager | null>(null);

  // Read at start time; changing these does not restart the ads.
  const latest = useRef(options);
  latest.current = options;
  const sourceKey = options.source ? JSON.stringify(options.source) : null;
  const { contentPlayer } = options;

  useEffect(() => {
    const source = latest.current.source;
    if (!source || !contentPlayer || !adSurface || !standbySurface) {
      return undefined;
    }
    const o = latest.current;
    const componentInstance = o.componentInstance ?? (() => appState.current.getComponentInstance());
    const http = o.http ?? fetchHttp;
    installImagePolyfill(http);
    const created = new AdManager({
      http,
      clock: o.clock ?? systemClock,
      content: new W3cPlayerAdapter(contentPlayer, componentInstance),
      createAdPlayer: () => new W3cPlayerAdapter((o.createVideoPlayer ?? newVideoPlayer)(), componentInstance),
      adSurface,
      standbySurface,
      macros: o.macros,
      mediaFile: o.mediaFile,
      prefetchSeconds: o.prefetchSeconds,
      onChange: setSnapshot,
      onEvent: (name) => latest.current.onEvent?.(name),
    });
    manager.current = created;
    void created.start(source);
    return () => {
      manager.current = null;
      setSnapshot(IDLE_SNAPSHOT);
      void created.dispose();
    };
    // sourceKey stands for `source`: a new object with the same content must not restart the ads.
  }, [sourceKey, contentPlayer, adSurface, standbySurface]);

  const inAd = snapshot.state === 'playing';
  const handleBack = options.handleBack ?? true;
  useEffect(() => {
    if (!inAd || !handleBack) {
      return undefined;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void manager.current?.back();
      return true;
    });
    return () => subscription.remove();
  }, [inAd, handleBack]);

  const skip = useCallback(() => manager.current?.skip() ?? false, []);
  const back = useCallback(async () => {
    await manager.current?.back();
  }, []);

  const strings = options.strings;
  const ui = useMemo(() => adUiState(snapshot, strings), [snapshot, strings]);
  const surfaces = useMemo<AdSurfaces>(
    () => ({
      shown: inAd ? snapshot.adSurface : null,
      onAdSurface: setAdSurface,
      onStandbySurface: setStandbySurface,
    }),
    [inAd, snapshot.adSurface],
  );

  return { snapshot, ui, surfaces, skip, back };
}
