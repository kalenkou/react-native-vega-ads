import type { VastMediaFile } from './types';

export const MEDIA_FILE_NOT_SUPPORTED = 403;

export interface MediaFileOptions {
  /** Screen height in lines; taller files are skipped when a smaller one exists. */
  maxHeight?: number;
  targetBitrateKbps?: number;
  /** Replaces the default rule entirely (R25). Gets only playable files. */
  select?: (playable: VastMediaFile[]) => VastMediaFile | undefined;
}

export type MediaFileChoice = { file: VastMediaFile; errorCode?: undefined } | { file?: undefined; errorCode: number };

const MP4 = 'video/mp4';
const HLS = new Set(['application/x-mpegurl', 'application/vnd.apple.mpegurl']);

function isPlayable(file: VastMediaFile): boolean {
  if (!file.fileURL || file.apiFramework) {
    return false;
  }
  const mime = (file.mimeType ?? '').toLowerCase();
  if (HLS.has(mime)) {
    return true;
  }
  if (mime !== MP4) {
    return false;
  }
  const codec = (file.codec ?? '').toLowerCase();
  return codec === '' || codec.startsWith('avc1') || codec.startsWith('avc3');
}

function isProgressiveMp4(file: VastMediaFile): boolean {
  return (file.mimeType ?? '').toLowerCase() === MP4;
}

function byClosestBitrate(target: number) {
  return (a: VastMediaFile, b: VastMediaFile): number => {
    const known = Number(b.bitrate > 0) - Number(a.bitrate > 0);
    if (known !== 0) {
      return known;
    }
    const distance = Math.abs(a.bitrate - target) - Math.abs(b.bitrate - target);
    return distance !== 0 ? distance : b.height - a.height;
  };
}

/**
 * Default rule (R6): playable type (H.264 mp4 or HLS), progressive mp4 first,
 * not taller than the screen, bitrate closest to the target.
 * Nothing playable → VAST error 403.
 */
export function selectMediaFile(files: VastMediaFile[], options: MediaFileOptions = {}): MediaFileChoice {
  const playable = files.filter(isPlayable);
  if (options.select) {
    const chosen = playable.length > 0 ? options.select(playable) : undefined;
    return chosen ? { file: chosen } : { errorCode: MEDIA_FILE_NOT_SUPPORTED };
  }

  const progressive = playable.filter(isProgressiveMp4);
  const pool = progressive.length > 0 ? progressive : playable;
  if (pool.length === 0) {
    return { errorCode: MEDIA_FILE_NOT_SUPPORTED };
  }

  const maxHeight = options.maxHeight ?? 1080;
  const fitting = pool.filter((file) => file.height <= maxHeight);
  if (fitting.length === 0) {
    const smallest = [...pool].sort((a, b) => a.height - b.height)[0];
    return smallest ? { file: smallest } : { errorCode: MEDIA_FILE_NOT_SUPPORTED };
  }

  const best = [...fitting].sort(byClosestBitrate(options.targetBitrateKbps ?? 2500))[0];
  return best ? { file: best } : { errorCode: MEDIA_FILE_NOT_SUPPORTED };
}
