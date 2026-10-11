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
  PlayerPort,
  ClockPort,
  HttpPort,
  IDLE_SNAPSHOT,
  installImagePolyfill,
  Macros,
  MediaFileOptions,
  SessionSnapshot,
} from 'react-native-ads-core';
import { W3cPlayerAdapter, W3cVideoPlayer } from './W3cPlayerAdapter';
import { fetchHttp, systemClock } from './platform';
import { createAdMediaControlHandler } from './adMediaControlHandler';

export interface UseVegaAdsOptions {
  /** A VMAP URL, or VAST tags with their times. `null` waits (for example, until the title is known). */
  source: AdSchedule | null;
  /**
   * Your content `VideoPlayer` (also when Shaka plays through it), initialized, with
   * `autoplay = false` and its source set. The hook starts it after the pre-roll, or at
   * once when there is none. Any other player works through a `PlayerPort` adapter.
   */
  contentPlayer: W3cVideoPlayer | PlayerPort | null;
  /** Your media controls handler for the content, if you use one; it is restored after each break. */
  contentMediaControlHandler?: unknown;
  /** Remote and voice may pause ads. Default true. */
  adPause?: boolean;
  /**
   * true (default, recommended on Vega): media controls own remote play/pause and Alexa
   * (needs the manifest entries). Ignore `playpause` in your own key handler while `playing`.
   * false: the library never takes media controls focus. Measured on Vega OS 1.2: without the
   * manifest entries a legacy player session still pauses a playing player on the key, so an
   * app that resumes the ad itself is undone; see DEVICE-TESTS.md.
   */
  mediaControls?: boolean;
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
  onContentSurface: (handle: string | null) => void;
  onAdSurface: (handle: string | null) => void;
  onStandbySurface: (handle: string | null) => void;
}

export interface VegaAds {
  /** True while an ad is on screen. Hide your player UI then and leave the remote play/pause key alone. */
  playing: boolean;
  /** The content has ended and its post-roll (if any) is over: safe to close the player screen. */
  ended: boolean;
  snapshot: SessionSnapshot;
  /** What AdOverlay shows. */
  ui: AdUiState;
  surfaces: AdSurfaces;
  /** Viewer pressed Skip. False when skipping is not allowed yet. */
  skip: () => boolean;
  /**
   * Play/pause of the ad from your own UI (for example an on-screen button). False outside ads.
   * Do not call it for the remote `playpause` key on Vega: media controls (or, without the
   * manifest entries, the legacy player session) already act on that key.
   */
  togglePause: () => boolean;
  /** Leave the ad break and go back to the content. */
  back: () => Promise<void>;
}

const newVideoPlayer = (): W3cVideoPlayer => new VideoPlayer() as unknown as W3cVideoPlayer;

const isPort = (player: W3cVideoPlayer | PlayerPort): player is PlayerPort => 'takeMediaControlFocus' in player;

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
  const appStateNow = useKeplerAppStateManager();
  const appState = useRef(appStateNow);
  appState.current = appStateNow;
  const [contentSurface, setContentSurface] = useState<string | null>(null);
  const [adSurface, setAdSurface] = useState<string | null>(null);
  const [standbySurface, setStandbySurface] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(IDLE_SNAPSHOT);
  const [ended, setEnded] = useState(false);
  const manager = useRef<AdManager | null>(null);
  /** Which source and player already started, so a restart (new surfaces) resumes instead of replaying. */
  const startedFor = useRef<{ key: string; player: W3cVideoPlayer | 'port'; manager: AdManager } | null>(null);

  // Read at start time; changing these does not restart the ads.
  const latest = useRef(options);
  latest.current = options;
  const sourceKey = options.source ? JSON.stringify(options.source) : null;
  // A w3cmedia player is identified by the object; a PlayerPort may be a new wrapper on every
  // render, so a port change alone does not restart the ads (change `source` to start over).
  const contentKey = options.contentPlayer === null ? null : isPort(options.contentPlayer) ? 'port' : options.contentPlayer;

  useEffect(() => {
    const source = latest.current.source;
    const contentPlayer = latest.current.contentPlayer;
    if (!source || !sourceKey || !contentPlayer || !contentSurface || !adSurface || !standbySurface) {
      return undefined;
    }
    const o = latest.current;
    const componentInstance = o.componentInstance ?? (() => appState.current.getComponentInstance());
    const http = o.http ?? fetchHttp;
    installImagePolyfill(http);
    const content = isPort(contentPlayer)
      ? contentPlayer
      : new W3cPlayerAdapter(
          contentPlayer,
          componentInstance,
          () => latest.current.contentMediaControlHandler,
          o.mediaControls ?? true,
        );
    const adHandler = createAdMediaControlHandler({ allowPause: o.adPause ?? true });
    const created = new AdManager({
      http,
      clock: o.clock ?? systemClock,
      content,
      createAdPlayer: () =>
        new W3cPlayerAdapter(
          (o.createVideoPlayer ?? newVideoPlayer)(),
          componentInstance,
          () => adHandler,
          o.mediaControls ?? true,
        ),
      adSurface,
      standbySurface,
      macros: o.macros,
      mediaFile: o.mediaFile,
      prefetchSeconds: o.prefetchSeconds,
      onChange: setSnapshot,
      onEvent: (name) => {
        if (name === 'content:ended') {
          setEnded(true);
        }
        latest.current.onEvent?.(name);
      },
    });
    manager.current = created;
    const previous = startedFor.current;
    const resumed = previous?.key === sourceKey && previous.player === contentKey && previous.manager.viewingStarted;
    startedFor.current = { key: sourceKey, player: contentKey as W3cVideoPlayer | 'port', manager: created };
    void created.start(source, resumed ? { resumeAt: content.getCurrentTime() } : {});
    return () => {
      manager.current = null;
      setSnapshot(IDLE_SNAPSHOT);
      setEnded(false);
      void created.dispose();
    };
    // sourceKey stands for `source`: a new object with the same content must not restart the ads.
  }, [sourceKey, contentKey, contentSurface, adSurface, standbySurface]);

  // Amazon requires releasing media resources in the background (R13): release the ad
  // players there and continue the content on return, without showing the break again.
  useEffect(() => {
    const subscription = appState.current.addAppStateListener('change', (state) => {
      if (state === 'background') {
        void manager.current?.suspend();
      } else if (state === 'active') {
        void manager.current?.wake();
      }
    });
    return () => subscription.remove();
  }, []);

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
  const togglePause = useCallback(
    () => (latest.current.adPause ?? true) && (manager.current?.togglePause() ?? false),
    [],
  );
  const back = useCallback(async () => {
    await manager.current?.back();
  }, []);

  const strings = options.strings;
  const ui = useMemo(() => adUiState(snapshot, strings), [snapshot, strings]);
  const surfaces = useMemo<AdSurfaces>(
    () => ({
      shown: inAd ? snapshot.adSurface : null,
      onContentSurface: setContentSurface,
      onAdSurface: setAdSurface,
      onStandbySurface: setStandbySurface,
    }),
    [inAd, snapshot.adSurface],
  );

  return { playing: inAd, ended, snapshot, ui, surfaces, skip, togglePause, back };
}
