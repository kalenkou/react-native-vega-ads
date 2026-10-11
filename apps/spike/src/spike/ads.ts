import {VASTTracker} from '@dailymotion/vast-client';
import {
  ClockPort,
  HttpPort,
  requestVast,
  requestVmap,
  selectMediaFile,
} from '@vega-ads/core';
import {log} from './log';

/** Public Google IMA sample tag: one 10-second inline linear ad. */
export const SINGLE_INLINE_TAG =
  'https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_ad_samples' +
  '&sz=640x480&cust_params=sample_ct%3Dlinear&ciu_szs=300x250%2C728x90&gdfp_req=1' +
  '&output=vast&unviewed_position_start=1&env=vp&impl=s&correlator=[CACHEBUSTING]';

/** Public Google IMA sample VMAP: pre-roll, optimized mid-roll pod of 3, post-roll. */
export const VMAP_OPTIMIZED_POD_TAG =
  'https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/vmap_ad_samples' +
  '&sz=640x480&cust_params=sample_ar%3Dpremidpostoptimizedpod&ciu_szs=300x250&gdfp_req=1' +
  '&ad_rule=1&output=vmap&unviewed_position_start=1&env=vp&impl=s&cmsid=496&vid=short_onecue&correlator=';

export const http: HttpPort = {
  get: async (url, options) => {
    const response = await fetch(url, {signal: options?.signal});
    return {
      status: response.status,
      ok: response.ok,
      text: () => response.text(),
    };
  },
};

export const clock: ClockPort = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface LoadedAd {
  tracker: VASTTracker;
  mediaUrl: string;
  durationSec: number;
}

export async function loadAd(
  tag: string = SINGLE_INLINE_TAG,
): Promise<LoadedAd | null> {
  const started = Date.now();
  const result = await requestVast(tag, {http, clock});
  if (result.status !== 'ok') {
    log(
      `ad (core): ${JSON.stringify(result)} after ${Date.now() - started} ms`,
    );
    return null;
  }
  const first = result.ads[0];
  if (!first) {
    return null;
  }
  const choice = selectMediaFile(first.creative.mediaFiles);
  if (!choice.file?.fileURL) {
    log(`ad (core): no playable file, error ${choice.errorCode}`);
    return null;
  }
  log(
    `ad (core): ready in ${Date.now() - started} ms, ${
      first.creative.duration
    }s, ` + `${choice.file.height}p, skipAfter=${first.skipAfter}`,
  );
  return {
    tracker: new VASTTracker(
      first.client,
      first.ad as never,
      first.creative as never,
    ),
    mediaUrl: choice.file.fileURL,
    durationSec: first.creative.duration,
  };
}

/** Device check of the VMAP path: parse breaks, resolve every source. */
export async function checkVmap(): Promise<void> {
  const started = Date.now();
  const vmap = await requestVmap(`${VMAP_OPTIMIZED_POD_TAG}${Date.now()}`, {
    http,
    clock,
  });
  if (vmap.status !== 'ok') {
    log(`vmap (core): ${JSON.stringify(vmap)}`);
    return;
  }
  log(
    `vmap (core): ${vmap.breaks.length} breaks in ${Date.now() - started} ms`,
  );
  for (const adBreak of vmap.breaks) {
    for (const source of adBreak.sources) {
      const vast = await requestVast(source.source, {http, clock});
      const summary =
        vast.status === 'ok'
          ? vast.ads
              .map((a) => `seq=${a.sequence} ${a.creative.duration}s`)
              .join(', ')
          : vast.status;
      log(`vmap ${adBreak.id} ${JSON.stringify(adBreak.offset)}: ${summary}`);
    }
  }
}
