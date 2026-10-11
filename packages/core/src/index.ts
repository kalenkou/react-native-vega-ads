export const VERSION = '0.0.0';

// Everything from the VAST layer, so apps get VAST and the break logic from one package.
export * from './vast';
export type { PlayerEventName, PlayerPort } from './ports';
export { BreakScheduler } from './schedule/BreakScheduler';
export type { Decision, SchedulerOptions } from './schedule/BreakScheduler';
export { PodController } from './pod/PodController';
export type { PodItem, PodOptions } from './pod/PodController';
export { AdBreakSession } from './machine/AdBreakSession';
export { AdManager, IDLE_SNAPSHOT } from './manager/AdManager';
export type { AdManagerDeps, AdSchedule } from './manager/AdManager';
export type { SessionDeps, SessionSnapshot, SessionState } from './machine/AdBreakSession';
export { adUiState, defaultAdUiStrings } from './ui/adUiState';
export type { AdUiState, AdUiStrings } from './ui/adUiState';
