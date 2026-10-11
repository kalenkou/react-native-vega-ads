import { type ReactElement, useEffect, useMemo, useRef } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { adIdMacros, type AdSchedule, type Macros } from 'react-native-ads-core';
import { AdOverlay } from './AdOverlay';
import { DualSurfaceView } from './DualSurfaceView';
import { useVegaAds, type UseVegaAdsOptions } from './useVegaAds';
import { useVideoPlayer } from './useVideoPlayer';
import { vegaAdIdSource, type VegaAdIdRetriever } from './vegaAdIdSource';

export interface VegaAdsPlayerProps extends Omit<UseVegaAdsOptions, 'source' | 'contentPlayer'> {
  /** The movie or episode. Null shows nothing yet. */
  source: { uri: string } | null;
  /** A VMAP URL, or VAST tags with their times. Null plays the content without ads. */
  ads: AdSchedule | null;
  /**
   * `AdIdRetriever` from @amazon-devices/kepler-adid-retriever: fills IFA and
   * LIMITADTRACKING and respects the user's opt-out. Needs the ad manager service in the manifest.
   */
  adId?: VegaAdIdRetriever;
  /** The content and its post-roll are over: close the screen here. */
  onEnd?: () => void;
  /** w3cmedia scaling mode. Default 'fit'. */
  scalingMode?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Content with ads in one component: creates and releases the content player, draws the
 * video surfaces and the ad overlay. Remote and Alexa play/pause work through media controls.
 *
 * ```tsx
 * <VegaAdsPlayer source={{ uri }} ads={{ vmapUrl }} adId={AdIdRetriever} onEnd={goBack} />
 * ```
 */
export function VegaAdsPlayer(props: VegaAdsPlayerProps): ReactElement {
  const { source, ads: schedule, adId, onEnd, scalingMode, style, macros, ...options } = props;
  const player = useVideoPlayer(source?.uri ?? null, { createVideoPlayer: options.createVideoPlayer });
  // The ID is read once per retriever: the user's choice does not change during playback.
  const allMacros = useMemo<Macros | undefined>(
    () => (adId ? { ...adIdMacros(vegaAdIdSource(adId)), ...macros } : macros),
    [adId, macros],
  );
  const ads = useVegaAds({ ...options, source: player ? (schedule ?? { breaks: [] }) : null, contentPlayer: player, macros: allMacros });

  const latestOnEnd = useRef(onEnd);
  latestOnEnd.current = onEnd;
  useEffect(() => {
    if (ads.ended) {
      latestOnEnd.current?.();
    }
  }, [ads.ended]);

  return (
    <View style={[styles.root, style]}>
      <DualSurfaceView surfaces={ads.surfaces} contentPlayer={player} scalingMode={scalingMode} />
      <AdOverlay ui={ads.ui} onSkip={ads.skip} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
});
