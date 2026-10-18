import { type ReactElement, type ReactNode, useEffect, useMemo, useRef } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import type { AdSchedule, Macros, PlayerPort } from 'react-native-ads-core';
import { AdCountdown } from './AdCountdown';
import { AdOverlay } from './AdOverlay';
import type { AdStyles } from './AdStyles';
import { PauseAd } from './PauseAd';
import { AdSurfaceLayers } from './AdSurfaceLayers';
import { DualSurfaceView } from './DualSurfaceView';
import { isPlayerPort, useVegaAds, type UseVegaAdsOptions, type VegaAds } from './useVegaAds';
import { useVideoPlayer } from './useVideoPlayer';
import { vegaMacros } from './preloadVegaAds';
import type { VegaAdIdRetriever } from './vegaAdIdSource';
import type { W3cVideoPlayer } from './W3cPlayerAdapter';

export interface VegaAdsPlayerState {
  /** The content player, null until it is ready. */
  player: W3cVideoPlayer | null;
  /** Ad state: `playing`, `ui`, `skip()`, `back()`... */
  ads: VegaAds;
}

export interface VegaAdsPlayerProps extends Omit<UseVegaAdsOptions, 'source' | 'contentPlayer'> {
  /** The movie or episode; the component creates and releases its player. Null waits. */
  source?: { uri: string } | null;
  /**
   * Your own content `VideoPlayer` instead of `source` (for example the one Shaka plays
   * through): initialized, `autoplay` off, source set. The component never releases it.
   * Or any `PlayerPort`, for example `rnvPlayerPort(player)` for react-native-video v7: then your
   * app draws the content (`<VideoView>`) in `children`, and `player` in `children` is null.
   */
  player?: W3cVideoPlayer | PlayerPort | null;
  /** A VMAP URL, or VAST tags with their times. Null plays the content without ads. */
  ads: AdSchedule | null;
  /**
   * `AdIdRetriever` from @amazon-devices/kepler-adid-retriever: fills IFA and
   * LIMITADTRACKING and respects the user's opt-out. Needs the ad manager service in the manifest.
   */
  adId?: VegaAdIdRetriever;
  /** The content and its post-roll are over: close the screen here. */
  onEnd?: () => void;
  /**
   * Your UI over the video: controls, captions, a title. Drawn below the ad overlay.
   * Hide controls while `ads.playing` is true.
   */
  children?: ReactNode | ((state: VegaAdsPlayerState) => ReactNode);
  /**
   * false: your app draws the content surface itself (in `children`); the component adds only
   * the two ad surfaces above it. Default true.
   */
  contentSurface?: boolean;
  /**
   * Your own ad label and Skip button instead of AdOverlay. Keep the D-pad focus on it during
   * ads, or the remote moves focus to the screen behind the ad.
   */
  renderOverlay?: (ads: VegaAds) => ReactNode;
  /**
   * Show under the ad label why the break looks as it does, for example "No Kettlo ad after a
   * scene with injury · Volume matched to the movie" (`ads.ui.why`). Default false.
   */
  showWhy?: boolean;
  /**
   * Show the ad's closed caption (VAST `<ClosedCaptionFiles>`, WebVTT) at the bottom of the
   * built-in ad overlay. Pass the viewer's caption setting; `captionLanguage` picks the file.
   * Default false.
   */
  adCaptions?: boolean;
  /**
   * "Ad in 5" before each mid-roll whose ads are ready. false: draw your own from
   * `ads.timeline.nextBreakIn`. Default true.
   */
  countdown?: boolean;
  /** Where the pause ad goes, for example `{ bottom: 200 }` to keep it clear of your controls. */
  pauseAdStyle?: StyleProp<ViewStyle>;
  /**
   * Your fonts, colours and positions for the built-in ad label, why line, Skip button, "Ad in 5"
   * and pause ad, on top of their defaults. Not used by `renderOverlay`.
   */
  adStyles?: AdStyles;
  /** w3cmedia scaling mode. Default 'fit'. */
  scalingMode?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Content with ads in one component. By default it creates and releases the content player,
 * draws the video surfaces and the ad overlay; each part can be replaced:
 *
 * ```tsx
 * <VegaAdsPlayer source={{ uri }} ads={{ vmapUrl }} adId={AdIdRetriever} onEnd={goBack}>
 *   {({ player, ads }) => !ads.playing && <MyControls player={player} />}
 * </VegaAdsPlayer>
 * ```
 */
export function VegaAdsPlayer(props: VegaAdsPlayerProps): ReactElement {
  const {
    source,
    player: appPlayer,
    ads: schedule,
    adId,
    onEnd,
    children,
    contentSurface = true,
    renderOverlay,
    showWhy = false,
    adCaptions = false,
    countdown = true,
    pauseAdStyle,
    adStyles,
    scalingMode,
    style,
    macros,
    ...options
  } = props;
  const ownsPlayer = appPlayer === undefined;
  const uri = ownsPlayer ? (source?.uri ?? null) : null;
  // In the background the movie player is released (Amazon requires it). Back in front, a new
  // player continues where the viewer was, without the ads already seen. When the viewer has seen
  // nothing yet, it starts over, pre-roll included.
  const resume = useRef<{ uri: string | null; seen: boolean; at?: number }>({ uri, seen: false });
  if (resume.current.uri !== uri) {
    resume.current = { uri, seen: false };
  }
  const created = useVideoPlayer(uri, {
    createVideoPlayer: options.createVideoPlayer,
    onRelease: (position) => {
      resume.current.at = resume.current.seen || position > 0 ? position : undefined;
    },
  });
  const contentPlayer = ownsPlayer ? created : appPlayer;
  // A PlayerPort has no w3cmedia surface to draw: the app shows the content itself.
  const port = contentPlayer !== null && isPlayerPort(contentPlayer);
  const player = contentPlayer === null || isPlayerPort(contentPlayer) ? null : contentPlayer;
  // The ID is read once per retriever and macro values: the user's choice does not change
  // during playback, and apps often pass `macros` as a new object on every render.
  const macrosKey = macros === undefined ? '' : JSON.stringify(macros);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `macros` is compared by `macrosKey`
  const allMacros = useMemo<Macros | undefined>(() => vegaMacros(adId, macros), [adId, macrosKey]);
  const ads = useVegaAds({
    ...options,
    startAt: resume.current.at ?? options.startAt,
    source: contentPlayer ? (schedule ?? { breaks: [] }) : null,
    contentPlayer,
    macros: allMacros,
  });
  if (ads.playing) {
    resume.current.seen = true;
  }

  const latestOnEnd = useRef(onEnd);
  latestOnEnd.current = onEnd;
  useEffect(() => {
    if (ads.ended) {
      latestOnEnd.current?.();
    }
  }, [ads.ended]);

  const ui = typeof children === 'function' ? children({ player, ads }) : children;
  return (
    <View style={[styles.root, style]}>
      {contentSurface && !port ? (
        <>
          <DualSurfaceView surfaces={ads.surfaces} contentPlayer={player} scalingMode={scalingMode} />
          {ui}
        </>
      ) : (
        <>
          {ui}
          <AdSurfaceLayers surfaces={ads.surfaces} scalingMode={scalingMode} />
        </>
      )}
      {countdown && !ads.playing && (
        <AdCountdown nextBreakIn={ads.timeline.nextBreakIn} strings={options.strings} styles={adStyles} />
      )}
      <PauseAd view={ads.pauseAd} strings={options.strings} style={pauseAdStyle} styles={adStyles} />
      {renderOverlay ? (
        renderOverlay(ads)
      ) : (
        <AdOverlay ui={ads.ui} onSkip={ads.skip} showWhy={showWhy} captions={adCaptions} styles={adStyles} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
});
