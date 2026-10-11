export const VERSION = '0.0.0';

export * from './ports';
export { installImagePolyfill } from './polyfill/image';
export { createUrlHandler, describeFailure, DEFAULT_VAST_TIMEOUT_MS } from './request/urlHandler';
export type { LoadFailure, UrlHandler, UrlHandlerResult } from './request/urlHandler';
export { requestVast, WRAPPER_LIMIT } from './request/VastRequester';
export type { LinearAd, VastResult, VastRequestDeps } from './request/VastRequester';
export { requestVmap, parseTimeOffset } from './request/VmapRequester';
export type { BreakOffset, BreakSource, ScheduledBreak, VmapResult, VmapTrackingEvent } from './request/VmapRequester';
export { selectMediaFile, MEDIA_FILE_NOT_SUPPORTED } from './request/mediaFileSelector';
export type { MediaFileChoice, MediaFileOptions } from './request/mediaFileSelector';
export type { AdSourceRef, VastAd, VastLinearCreative, VastMediaFile } from './request/types';
export { BreakScheduler } from './schedule/BreakScheduler';
export type { Decision, SchedulerOptions } from './schedule/BreakScheduler';
