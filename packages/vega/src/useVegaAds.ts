import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { useKeplerAppStateManager } from '@amazon-devices/react-native-kepler';
import {
  AdManager,
  AdSchedule,
  AdTimeline,
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
  PauseAdView,
  RepeatOptions,
  SessionSnapshot,
} from 'react-native-ads-core';
import { W3cPlayerAdapter, W3cVideoPlayer } from './W3cPlayerAdapter';
import { fetchHttp, systemClock } from './platform';
import { createAdMediaControlHandler } from './adMediaControlHandler';
import { contentMediaControlHandler } from './contentMediaControlHandler';
import { takePreload } from './preloadVegaAds';
import { newVideoPlayer } from './useVideoPlayer';

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
   * false: the library never takes media controls focus. Without the manifest entries the system's
   * legacy player session still pauses the player on the play/pause key, so an app that resumes
   * the ad itself is undone (measured on a Fire TV Stick).
   */
  mediaControls?: boolean;
  /** Ad tag macros, for example from `adIdMacros()` (IFA, LIMITADTRACKING). */
  macros?: Macros;
  /** How early a break is loaded and buffered. Default 15 s. */
  prefetchSeconds?: number;
  /** How many seconds before a mid-roll `timeline.nextBreakIn` counts down. Default 5. */
  countdownSeconds?: number;
  /**
   * On by default: a creative is not shown again within 30 minutes (`{ withinMs }` to change),
   * and a break has one copy of each creative and one ad per advertiser. `false` turns it off.
   */
  avoidRepeats?: false | RepeatOptions;
  /** At most this many ads in a break; also sent as `[BREAKMAXADS]`. */
  maxBreakAds?: number;
  /** A break never runs longer than this; also sent as `[BREAKMAXDURATION]`. */
  maxBreakSeconds?: number;
  /**
   * The content's integrated loudness in LUFS (EBU R128), measured when it was packaged. Ads
   * louder than it (their `loudness` creative extension) are turned down to it, never up.
   */
  contentLoudness?: number;
  /**
   * The viewer's caption language (BCP 47, such as "en-US"), for ads with `<ClosedCaptionFiles>`:
   * the WebVTT file in it, else the first one. `ads.ui.caption` has the line to show.
   */
  captionLanguage?: string;
  /**
   * VAST tag of a pause ad (IAB CTV Ad Portfolio, a `<NonLinear>` image): shown when the viewer
   * pauses the content, never when a break pauses it. Draw it with `<PauseAd view={ads.pauseAd} />`.
   */
  pauseAdUrl?: string;
  /** How long the content stays paused before the pause ad shows. Default 1500 ms. */
  pauseAdDelayMs?: number;
  mediaFile?: MediaFileOptions;
  /** Overlay texts; English by default. */
  strings?: Partial<AdUiStrings>;
  /**
   * What Back does during an ad (R23). `'app'` (default): nothing here, Back goes to your app as
   * in the content, which usually closes the player; an ad cannot be skipped with Back.
   * `'content'`: the break ends and the content plays on, without skip or close pixels.
   */
  backDuringAd?: 'app' | 'content';
  /** IAB events sent and errors, for logs and analytics. */
  onEvent?: (name: string) => void;
  /** Defaults to the app's own component instance (needed for remote and Alexa play/pause). */
  componentInstance?: () => unknown;
  /** For tests and other runtimes. */
  createVideoPlayer?: () => W3cVideoPlayer;
  /**
   * Ad players as any `PlayerPort`, for example a `HeadlessPlayerAdapter` session of a headless
   * player service. Each call must return a new player. Replaces `createVideoPlayer`.
   */
  createAdPlayer?: () => PlayerPort;
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
  /** Mid-rolls to mark on your timeline, and the countdown to the next one (AdCountdown). */
  timeline: AdTimeline;
  surfaces: AdSurfaces;
  /** The pause ad to show (`<PauseAd>`), or null. Back closes it. */
  pauseAd: PauseAdView | null;
  /** Close the pause ad. False when none is on screen. */
  closePauseAd: () => boolean;
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

const NO_TIMELINE: AdTimeline = Object.freeze({ marks: [], nextBreakIn: null });

export const isPlayerPort = (player: W3cVideoPlayer | PlayerPort): player is PlayerPort => 'takeMediaControlFocus' in player;

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
  const [timeline, setTimeline] = useState<AdTimeline>(NO_TIMELINE);
  const [pauseAd, setPauseAd] = useState<PauseAdView | null>(null);
  const manager = useRef<AdManager | null>(null);
  /** Which source and player already started, so a restart (new surfaces) resumes instead of replaying. */
  const startedFor = useRef<{ key: string; player: W3cVideoPlayer | 'port'; manager: AdManager } | null>(null);

  // Read at start time; changing these does not restart the ads.
  const latest = useRef(options);
  latest.current = options;
  const sourceKey = options.source ? JSON.stringify(options.source) : null;
  // A w3cmedia player is identified by the object; a PlayerPort may be a new wrapper on every
  // render, so a port change alone does not restart the ads (change `source` to start over).
  const contentKey = options.contentPlayer === null ? null : isPlayerPort(options.contentPlayer) ? 'port' : options.contentPlayer;

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
    // The content's handler also reports a viewer's pause command, for pause ads.
    let ownContentHandler: unknown;
    const viewerPaused = (): void => manager.current?.viewerPaused();
    const contentHandler = (): unknown => {
      const app = latest.current.contentMediaControlHandler;
      if (app !== undefined) {
        return contentMediaControlHandler(app, viewerPaused);
      }
      ownContentHandler ??= contentMediaControlHandler(undefined, viewerPaused);
      return ownContentHandler;
    };
    const content = isPlayerPort(contentPlayer)
      ? contentPlayer
      : new W3cPlayerAdapter(contentPlayer, componentInstance, contentHandler, o.mediaControls ?? true);
    const adHandler = createAdMediaControlHandler({ allowPause: o.adPause ?? true });
    const created = new AdManager({
      http,
      clock: o.clock ?? systemClock,
      content,
      createAdPlayer: () =>
        o.createAdPlayer?.() ??
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
      countdownSeconds: o.countdownSeconds,
      avoidRepeats: o.avoidRepeats,
      maxBreakAds: o.maxBreakAds,
      maxBreakSeconds: o.maxBreakSeconds,
      contentLoudness: o.contentLoudness,
      captionLanguage: o.captionLanguage,
      pauseAdUrl: o.pauseAdUrl,
      pauseAdDelayMs: o.pauseAdDelayMs,
      onPauseAd: setPauseAd,
      onChange: setSnapshot,
      onTimeline: setTimeline,
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
    // A preloadVegaAds() of this schedule (from the title's page) saves the first ad requests.
    void created.start(source, resumed ? { resumeAt: content.getCurrentTime() } : { preloaded: takePreload(sourceKey) });
    return () => {
      manager.current = null;
      setSnapshot(IDLE_SNAPSHOT);
      setTimeline(NO_TIMELINE);
      setPauseAd(null);
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
  const backToContent = options.backDuringAd === 'content';
  useEffect(() => {
    if (!inAd || !backToContent) {
      return undefined;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void manager.current?.back();
      return true;
    });
    return () => subscription.remove();
  }, [inAd, backToContent]);

  const pauseAdShown = pauseAd !== null;
  useEffect(() => {
    if (!pauseAdShown) {
      return undefined;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => manager.current?.closePauseAd() ?? false);
    return () => subscription.remove();
  }, [pauseAdShown]);
  const closePauseAd = useCallback(() => manager.current?.closePauseAd() ?? false, []);

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

  return { playing: inAd, ended, snapshot, ui, timeline, surfaces, pauseAd, closePauseAd, skip, togglePause, back };
}
