import { ClockPort, HttpPort, Macros, requestVast, requestVmap, ScheduledBreak, VastResult } from '../vast';
import type { AdSchedule } from './AdManager';

/** The ad requests of a title made before its player exists: the schedule and the pre-roll's VAST. */
export interface PreloadedAds {
  /** Which schedule this is for: AdManager uses it only for the same one. */
  key: string;
  /** Clock time of the request, in ms: old answers are not used, the ads may have expired. */
  at: number;
  /** The breaks; null when the VMAP request failed (the manager then asks again). */
  breaks: ScheduledBreak[] | null;
  /** The pre-roll's VAST answers, one per ad source; null without a pre-roll. */
  preroll: { breakId: string; results: VastResult[] } | null;
}

export interface PreloadDeps {
  http: HttpPort;
  clock: ClockPort;
  /** The same ad tag macros the player will use (for example `adIdMacros()`). */
  macros?: Macros;
}

/** The identity of a schedule, for matching a preload to the playback it was made for. */
export const scheduleKey = (schedule: AdSchedule): string => JSON.stringify(schedule);

/** The breaks of a schedule; `errorCode` when its VMAP request failed. */
export async function resolveSchedule(
  schedule: AdSchedule,
  deps: { http: HttpPort; clock: ClockPort },
): Promise<{ breaks: ScheduledBreak[]; errorCode?: number }> {
  if ('breaks' in schedule) {
    return {
      breaks: schedule.breaks.map((b, i) => ({
        id: `break-${i + 1}`,
        offset: b.offset === 'start' || b.offset === 'end' ? { kind: b.offset } : { kind: 'time', seconds: b.offset },
        sources: [{ id: null, source: { kind: 'url', url: b.vastUrl }, allowMultipleAds: true, track: () => undefined }],
        blockedAdCategories: b.blockedAdCategories,
      })),
    };
  }
  const vmap = await requestVmap(schedule.vmapUrl, deps);
  if (vmap.status === 'failed') {
    return { breaks: [], errorCode: vmap.errorCode };
  }
  return { breaks: vmap.status === 'ok' ? vmap.breaks : [] };
}

/**
 * Asks the ad server for a title's schedule and pre-roll while the viewer is still on its page,
 * so the pre-roll starts sooner after Play. Pass the promise to `AdManager.start()` as
 * `preloaded`; it is used for the same schedule within five minutes, otherwise the manager
 * asks again. Later breaks are requested during playback as usual. Never rejects.
 */
export async function preloadAds(schedule: AdSchedule, deps: PreloadDeps): Promise<PreloadedAds> {
  const key = scheduleKey(schedule);
  const at = deps.clock.now();
  try {
    const { breaks, errorCode } = await resolveSchedule(schedule, deps);
    if (errorCode !== undefined) {
      return { key, at, breaks: null, preroll: null };
    }
    const pre = breaks.find((b) => b.offset.kind === 'start');
    const results = pre
      ? await Promise.all(
          pre.sources.map((s) => requestVast(s.source, { http: deps.http, clock: deps.clock, macros: deps.macros })),
        )
      : null;
    return { key, at, breaks, preroll: pre && results ? { breakId: pre.id, results } : null };
  } catch {
    return { key, at, breaks: null, preroll: null };
  }
}
