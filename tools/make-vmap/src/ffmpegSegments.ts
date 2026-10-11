import type { Segment } from './segments';

/** Runs ffmpeg with these arguments and resolves with its stderr (where the detection filters log). */
export type FfmpegRunner = (args: string[]) => Promise<string>;

export interface FfmpegDetection {
  segments: Segment[];
  durationSeconds?: number;
}

/** A frame that differs this much (0-1) from the previous one is a shot change. */
const SCENE_THRESHOLD = 0.4;

/**
 * One pass over the file: black frames are found before `select` keeps only the shot changes,
 * so both see every frame; silence comes from the audio track.
 */
export function ffmpegArgs(file: string): string[] {
  return [
    '-hide_banner',
    '-nostats',
    '-i',
    file,
    '-vf',
    `blackdetect=d=0.3:pix_th=0.10,select='gt(scene,${SCENE_THRESHOLD})',showinfo`,
    '-af',
    'silencedetect=n=-40dB:d=0.5',
    '-f',
    'null',
    '-',
  ];
}

const ms = (seconds: string): number => Math.round(Number(seconds) * 1000);

interface Interval {
  start: number;
  end: number;
}

/**
 * Reads ffmpeg's `showinfo` (shot changes), `blackdetect` and `silencedetect` log lines as
 * Rekognition-style segments, so `pickBreaks` works the same on either source. A black run
 * counts only when it is also silent (when the file has audio): a quiet place for an ad.
 */
export function parseFfmpegLog(log: string): FfmpegDetection {
  const segments: Segment[] = [];
  const shots: number[] = [];
  const black: Interval[] = [];
  const silence: Interval[] = [];
  let silenceStart: number | null = null;
  let durationSeconds: number | undefined;
  let hasAudio = false;

  for (const line of log.split('\n')) {
    if (/Stream #\d+:\d+.*: Audio:/.test(line)) {
      hasAudio = true;
      continue;
    }
    const duration = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line);
    if (duration && durationSeconds === undefined) {
      durationSeconds = Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
      continue;
    }
    const shot = /Parsed_showinfo.*\bpts_time:(-?\d+(?:\.\d+)?)/.exec(line);
    if (shot) {
      shots.push(ms(shot[1]!));
      continue;
    }
    const run = /black_start:(\d+(?:\.\d+)?) black_end:(\d+(?:\.\d+)?)/.exec(line);
    if (run) {
      black.push({ start: ms(run[1]!), end: ms(run[2]!) });
      continue;
    }
    const quietStart = /silence_start: (-?\d+(?:\.\d+)?)/.exec(line);
    if (quietStart) {
      silenceStart = Math.max(0, ms(quietStart[1]!));
      continue;
    }
    const quietEnd = /silence_end: (\d+(?:\.\d+)?)/.exec(line);
    if (quietEnd && silenceStart !== null) {
      silence.push({ start: silenceStart, end: ms(quietEnd[1]!) });
      silenceStart = null;
    }
  }
  if (silenceStart !== null) {
    silence.push({ start: silenceStart, end: Number.MAX_SAFE_INTEGER }); // silent to the end
  }

  // A shot lasts until the next shot change (or the end), as in Rekognition's SHOT segments.
  const end = durationSeconds !== undefined ? Math.round(durationSeconds * 1000) : undefined;
  shots.sort((x, y) => x - y);
  shots.forEach((start, index) => {
    const next = shots[index + 1] ?? end ?? start;
    segments.push({ Type: 'SHOT', StartTimestampMillis: start, EndTimestampMillis: next, ShotSegment: { Confidence: 100 } });
  });

  // Without an audio track every black run is quiet; with one, only the silent runs are.
  const hasAudioInfo = hasAudio || silence.length > 0;
  for (const interval of black) {
    const silent = silence.some((quiet) => quiet.start < interval.end && quiet.end > interval.start);
    if (!hasAudioInfo || silent) {
      segments.push({
        Type: 'TECHNICAL_CUE',
        StartTimestampMillis: interval.start,
        EndTimestampMillis: interval.end,
        TechnicalCueSegment: { Type: 'BlackFrames', Confidence: 100 },
      });
    }
  }
  return { segments, durationSeconds };
}

/** Shot changes and silent black frames of a local video file, found by ffmpeg ($0, no cloud). */
export async function ffmpegSegments(file: string, run: FfmpegRunner): Promise<FfmpegDetection> {
  return parseFfmpegLog(await run(ffmpegArgs(file)));
}
