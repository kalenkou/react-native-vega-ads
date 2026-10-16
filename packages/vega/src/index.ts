export const VERSION = '0.1.0';

export { W3cPlayerAdapter } from './W3cPlayerAdapter';
export type { W3cVideoPlayer } from './W3cPlayerAdapter';
export { VegaAdsPlayer } from './VegaAdsPlayer';
export type { VegaAdsPlayerProps, VegaAdsPlayerState } from './VegaAdsPlayer';
export { useVideoPlayer } from './useVideoPlayer';
export type { UseVideoPlayerOptions } from './useVideoPlayer';
export { useVegaAds } from './useVegaAds';
export type { AdSurfaces, UseVegaAdsOptions, VegaAds } from './useVegaAds';
export { DualSurfaceView } from './DualSurfaceView';
export { AdSurfaceLayers } from './AdSurfaceLayers';
export type { AdSurfaceLayersProps } from './AdSurfaceLayers';
export { createAdMediaControlHandler } from './adMediaControlHandler';
export type { AdMediaControlOptions } from './adMediaControlHandler';
export type { DualSurfaceViewProps } from './DualSurfaceView';
export { AdOverlay, useAdAnnouncements } from './AdOverlay';
export type { AdOverlayProps } from './AdOverlay';
export { AdSkipButton } from './AdSkipButton';
export type { AdSkipButtonProps } from './AdSkipButton';
export type { AdStyles } from './AdStyles';
export { AdCountdown } from './AdCountdown';
export type { AdCountdownProps } from './AdCountdown';
export { PauseAd } from './PauseAd';
export type { PauseAdProps } from './PauseAd';
export type { PauseAdView } from 'react-native-ads-core';
export type { AdTimeline, BreakMark, RepeatMemory, RepeatOptions } from 'react-native-ads-core';
// Types the API takes or returns, so an app needs no direct dependency on the core package.
export type {
  AdIdSource,
  AdSchedule,
  AdUiState,
  AdUiStrings,
  Macros,
  MediaFileOptions,
  PlayerEventName,
  PlayerPort,
  SessionSnapshot,
  BreakWhy,
  ClockPort,
  HttpPort,
} from 'react-native-ads-core';
export { fetchHttp, systemClock } from './platform';
export { vegaAdIdSource } from './vegaAdIdSource';
export { adIdMacros } from 'react-native-ads-core';
export type { VegaAdIdRetriever } from './vegaAdIdSource';
export { preloadVegaAds, useAdPlan } from './preloadVegaAds';
export { adPlanLabel, watchReport, watchReportLabel } from 'react-native-ads-core';
export type { AdPlan, AdPlanMark, WatchReport } from 'react-native-ads-core';
export type { PreloadVegaAdsOptions } from './preloadVegaAds';
export { rnvPlayerPort } from './rnvPlayerPort';
export type { RnvPlayerLike, RnvPlayerPortOptions } from './rnvPlayerPort';
