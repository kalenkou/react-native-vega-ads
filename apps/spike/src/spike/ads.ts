import { VASTClient, VASTTracker } from '@dailymotion/vast-client';
import { log } from './log';
import { urlHandler } from './urlHandler';

/** Public Google IMA sample tag: one 10-second inline linear ad. */
export const SINGLE_INLINE_TAG =
  'https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_ad_samples' +
  '&sz=640x480&cust_params=sample_ct%3Dlinear&ciu_szs=300x250%2C728x90&gdfp_req=1' +
  '&output=vast&unviewed_position_start=1&env=vp&impl=s&correlator=';

export interface LoadedAd {
  tracker: VASTTracker;
  mediaUrl: string;
  durationSec: number;
}

interface MediaFileLike {
  fileURL: string | null;
  mimeType: string | null;
  height: number;
  bitrate: number;
}

function pickMp4(mediaFiles: MediaFileLike[]): MediaFileLike | undefined {
  return mediaFiles
    .filter((file) => file.mimeType === 'video/mp4' && file.fileURL)
    .sort((a, b) => b.height - a.height || b.bitrate - a.bitrate)[0];
}

export async function loadAd(tag: string = SINGLE_INLINE_TAG): Promise<LoadedAd | null> {
  const started = Date.now();
  const client = new VASTClient();
  const url = `${tag}${Math.floor(Math.random() * 1e9)}`;
  try {
    const response = await client.get(url, {
      urlHandler,
      timeout: 4000,
      wrapperLimit: 5,
      resolveAll: true,
    });
    const ad = response.ads[0];
    const creative = ad?.creatives.find((c: { type: string }) => c.type === 'linear');
    if (!ad || !creative) {
      log(`ad: empty response after ${Date.now() - started} ms`);
      return null;
    }
    const file = pickMp4(creative.mediaFiles as MediaFileLike[]);
    if (!file?.fileURL) {
      log('ad: no mp4 media file (would be error 403)');
      return null;
    }
    const tracker = new VASTTracker(client, ad, creative);
    log(`ad: ready in ${Date.now() - started} ms, ${creative.duration}s, ${file.height}p`);
    return { tracker, mediaUrl: file.fileURL, durationSec: creative.duration };
  } catch (error) {
    log(`ad: failed ${String(error)}`);
    return null;
  }
}
