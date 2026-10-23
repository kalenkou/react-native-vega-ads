export const VERSION = '0.1.5';

// Components
export { VegaAdsPlayer } from './VegaAdsPlayer';
export type { VegaAdsPlayerProps, VegaAdsPlayerState } from './VegaAdsPlayer';
export { DualSurfaceView } from './DualSurfaceView';
export type { DualSurfaceViewProps } from './DualSurfaceView';
export { AdSurfaceLayers } from './AdSurfaceLayers';
export type { AdSurfaceLayersProps } from './AdSurfaceLayers';
export { AdOverlay, useAdAnnouncements } from './AdOverlay';
export type { AdOverlayProps } from './AdOverlay';
export { AdSkipButton } from './AdSkipButton';
export type { AdSkipButtonProps } from './AdSkipButton';
export { AdCountdown } from './AdCountdown';
export type { AdCountdownProps } from './AdCountdown';
export { PauseAd } from './PauseAd';
export type { PauseAdProps } from './PauseAd';
export type { AdStyles } from './AdStyles';
export { LAYOUT_WIDTH, layoutScale, scaleStyles } from './layout';

// Hooks
export { useVegaAds } from './useVegaAds';
export type { AdSurfaces, UseVegaAdsOptions, VegaAds } from './useVegaAds';
export { useVideoPlayer } from './useVideoPlayer';
/** `useVideoPlayer` under a name that does not clash with react-native-video's hook. */
export { useVideoPlayer as useVegaVideoPlayer } from './useVideoPlayer';
export type { UseVideoPlayerOptions } from './useVideoPlayer';
export { preloadVegaAds, useAdPlan } from './preloadVegaAds';
export type { PreloadVegaAdsOptions } from './preloadVegaAds';

// Players and the platform
export { W3cPlayerAdapter } from './W3cPlayerAdapter';
export type { W3cVideoPlayer } from './W3cPlayerAdapter';
export { HeadlessPlayerAdapter } from './HeadlessPlayerAdapter';
export { HeadlessPlayerService } from './HeadlessPlayerService';
export type { HeadlessPlayerServer, HeadlessServicePlayer } from './HeadlessPlayerService';
export type {
  HeadlessErrorListener,
  HeadlessPlayerClient,
  HeadlessPlayerOptions,
  HeadlessPositionListener,
  HeadlessStatusListener,
  HeadlessSessionId,
  HeadlessSessionStatus,
} from './HeadlessPlayerAdapter';
export { rnvPlayerPort } from './rnvPlayerPort';
export { useStitchedAds } from './useStitchedAds';
export type { StitchedAds, UseStitchedAdsOptions } from './useStitchedAds';
export type { RnvPlayerLike, RnvPlayerPortOptions } from './rnvPlayerPort';
export { createAdMediaControlHandler } from './adMediaControlHandler';
export type { AdMediaControlOptions } from './adMediaControlHandler';
export { fetchHttp, systemClock } from './platform';
export { vegaAdIdSource } from './vegaAdIdSource';
export type { VegaAdIdRetriever } from './vegaAdIdSource';

// From react-native-ads-core, so an app needs no direct dependency on it.
export { adIdMacros, adPlanLabel, MAX_REDIRECTS, watchReport, watchReportLabel } from 'react-native-ads-core';
export type {
  AdEventAd,
  AdEventHandler,
  AdEventInfo,
  AdEventName,
  AdIdSource,
  AdPlan,
  AdPlanMark,
  AdSchedule,
  AdTimeline,
  AdUiState,
  AdUiStrings,
  BreakMark,
  BreakWhy,
  ClockPort,
  HttpPort,
  Macros,
  MediaFileOptions,
  PauseAdView,
  PlayerEventName,
  PlayerPort,
  RepeatMemory,
  RepeatOptions,
  SessionSnapshot,
  SessionState,
  StitchedAdState,
  WatchReport,
} from 'react-native-ads-core';
