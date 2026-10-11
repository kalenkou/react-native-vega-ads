export const VERSION = '0.0.0';

// Everything from the VAST layer, so apps get VAST and the break logic from one package.
export * from './vast';
export { installDOMParser } from './xml';
export type { PlayerEventName, PlayerPort } from './ports';
export { BreakScheduler } from './schedule/BreakScheduler';
export type { BreakMark, Decision, SchedulerOptions } from './schedule/BreakScheduler';
export { PodController } from './pod/PodController';
export type { PodItem, PodOptions } from './pod/PodController';
export { RepeatGuard, REPEAT_WINDOW_MS } from './pod/RepeatGuard';
export type { DroppedAd, RepeatMemory, RepeatOptions } from './pod/RepeatGuard';
export { PauseAdController } from './pause/PauseAdController';
export type { PauseAdDeps, PauseAdView } from './pause/PauseAdController';
export { AdBreakSession } from './machine/AdBreakSession';
export { AdManager, IDLE_SNAPSHOT } from './manager/AdManager';
export type { AdManagerDeps, AdSchedule, AdTimeline } from './manager/AdManager';
export { preloadAds } from './manager/preloadAds';
export type { PreloadDeps, PreloadedAds } from './manager/preloadAds';
export type { SessionDeps, SessionSnapshot, SessionState } from './machine/AdBreakSession';
export { adCountdownState, adUiState, defaultAdUiStrings } from './ui/adUiState';
export type { AdCountdownState, AdUiState, AdUiStrings } from './ui/adUiState';
