import { type ReactElement, type ReactNode, useEffect, useMemo, useRef } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import type { AdSchedule, Macros, PlayerPort } from 'react-native-ads-core';
import { AdCountdown } from './AdCountdown';
import { AdOverlay } from './AdOverlay';
import { PauseAd } from './PauseAd';
import { AdSurfaceLayers } from './AdSurfaceLayers';
import { DualSurfaceView } from './DualSurfaceView';
import { useVegaAds, type UseVegaAdsOptions, type VegaAds } from './useVegaAds';
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
   * "Ad in 5" before each mid-roll whose ads are ready. false: draw your own from
   * `ads.timeline.nextBreakIn`. Default true.
   */
  countdown?: boolean;
  /** Where the pause ad goes, for example `{ bottom: 200 }` to keep it clear of your controls. */
  pauseAdStyle?: StyleProp<ViewStyle>;
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
    countdown = true,
    pauseAdStyle,
    scalingMode,
    style,
    macros,
    ...options
  } = props;
  const ownsPlayer = appPlayer === undefined;
  const created = useVideoPlayer(ownsPlayer ? (source?.uri ?? null) : null, { createVideoPlayer: options.createVideoPlayer });
  const contentPlayer = ownsPlayer ? created : appPlayer;
  // A PlayerPort has no w3cmedia surface to draw: the app shows the content itself.
  const port = contentPlayer !== null && 'takeMediaControlFocus' in contentPlayer;
  const player = port ? null : (contentPlayer as W3cVideoPlayer | null);
  // The ID is read once per retriever: the user's choice does not change during playback.
  const allMacros = useMemo<Macros | undefined>(() => vegaMacros(adId, macros), [adId, macros]);
  const ads = useVegaAds({
    ...options,
    source: contentPlayer ? (schedule ?? { breaks: [] }) : null,
    contentPlayer,
    macros: allMacros,
  });

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
      {countdown && !ads.playing && <AdCountdown nextBreakIn={ads.timeline.nextBreakIn} strings={options.strings} />}
      <PauseAd view={ads.pauseAd} strings={options.strings} style={pauseAdStyle} />
      {renderOverlay ? renderOverlay(ads) : <AdOverlay ui={ads.ui} onSkip={ads.skip} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
});
