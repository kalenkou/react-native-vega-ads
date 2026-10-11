import type { Segment } from './segments';

/** A stretch of speech, in milliseconds from the start of the video. */
export interface SpeechInterval {
  startMs: number;
  endMs: number;
}

export interface PickBreaksOptions {
  /** Minimum time between two mid-rolls. Default 300. */
  minGapSeconds?: number;
  /** No mid-roll before this time. Default 120. */
  firstBreakAfterSeconds?: number;
  /** Upper limit on the number of mid-rolls. Default: no limit. */
  maxBreaks?: number;
  /** No mid-roll in the last part of the video. Default 60. */
  avoidLastSeconds?: number;
  /**
   * How far after the first usable cut to look for black frames, which are preferred. Default 60.
   */
  searchWindowSeconds?: number;
  /** Segments with a lower confidence (0-100) are ignored. Default 0: Rekognition already drops those under 50. */
  minConfidence?: number;
  /** Video length. Default: the latest segment end. */
  durationSeconds?: number;
  /** Where people speak: no mid-roll inside speech or within a second of it. Default: none. */
  speech?: readonly SpeechInterval[];
}

interface Candidate {
  ms: number;
  black: boolean;
}

interface Interval {
  start: number;
  end: number;
}

/** Technical cues that must never contain an ad break. */
const BLOCKING_CUES = new Set(['OpeningCredits', 'EndCredits', 'ColorBars', 'Slate', 'StudioLogo']);

/** Clear time kept around speech, so an ad never clips the first or last word of a line. */
const SPEECH_MARGIN_MS = 1000;

function checkOption(name: string, value: number, integer = false): number {
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    throw new RangeError(`${name} must be a non-negative ${integer ? 'integer' : 'number'}, got ${value}`);
  }
  return value;
}

function confidenceOf(segment: Segment): number {
  return segment.ShotSegment?.Confidence ?? segment.TechnicalCueSegment?.Confidence ?? 100;
}

function inside(ms: number, intervals: Interval[]): boolean {
  return intervals.some((interval) => ms >= interval.start && ms <= interval.end);
}

/**
 * Chooses mid-roll times (in seconds, ascending) from Rekognition segment detection results.
 *
 * Rules:
 * - candidates are the middle of each black-frame run and each hard cut (the start of a shot);
 * - a cut inside a black-frame run is the same break as that run;
 * - nothing inside opening credits, colour bars, slates or studio logos;
 * - nothing from the start of the end credits to the end of the video;
 * - nothing inside `speech` or within a second of it;
 * - nothing before `firstBreakAfterSeconds` or in the last `avoidLastSeconds`;
 * - breaks are at least `minGapSeconds` apart;
 * - from the earliest allowed candidate, black frames within `searchWindowSeconds` win over that candidate.
 */
export function pickBreaks(segments: readonly Segment[], options: PickBreaksOptions = {}): number[] {
  const minGap = checkOption('minGapSeconds', options.minGapSeconds ?? 300) * 1000;
  const firstAfter = checkOption('firstBreakAfterSeconds', options.firstBreakAfterSeconds ?? 120) * 1000;
  const avoidLast = checkOption('avoidLastSeconds', options.avoidLastSeconds ?? 60) * 1000;
  const window = checkOption('searchWindowSeconds', options.searchWindowSeconds ?? 60) * 1000;
  const minConfidence = checkOption('minConfidence', options.minConfidence ?? 0);
  const maxBreaks = checkOption('maxBreaks', options.maxBreaks ?? Number.MAX_SAFE_INTEGER, true);

  const timed = segments.filter(
    (segment): segment is Segment & { StartTimestampMillis: number; EndTimestampMillis: number } =>
      typeof segment.StartTimestampMillis === 'number' && typeof segment.EndTimestampMillis === 'number',
  );
  if (timed.length === 0) return [];

  const durationMs =
    options.durationSeconds !== undefined
      ? checkOption('durationSeconds', options.durationSeconds) * 1000
      : Math.max(...timed.map((segment) => segment.EndTimestampMillis));
  const lastAllowed = durationMs - avoidLast;
  const speech: Interval[] = (options.speech ?? []).map((interval) => ({
    start: interval.startMs - SPEECH_MARGIN_MS,
    end: interval.endMs + SPEECH_MARGIN_MS,
  }));

  // Credits and similar cues block breaks whatever their confidence: a false block costs less than an ad in the credits.
  const blocked: Interval[] = [];
  const blackRuns: Interval[] = [];
  const cuts: number[] = [];
  for (const segment of timed) {
    const start = segment.StartTimestampMillis;
    const end = segment.EndTimestampMillis;
    const cueType = segment.Type === 'TECHNICAL_CUE' ? segment.TechnicalCueSegment?.Type : undefined;
    if (cueType === 'EndCredits') {
      blocked.push({ start, end: Math.max(end, durationMs) });
    } else if (cueType !== undefined && BLOCKING_CUES.has(cueType)) {
      blocked.push({ start, end });
    } else if (confidenceOf(segment) < minConfidence) {
      continue;
    } else if (cueType === 'BlackFrames') {
      blackRuns.push({ start, end });
    } else if (segment.Type === 'SHOT' && start > 0) {
      cuts.push(start);
    }
  }

  const candidates: Candidate[] = [
    ...blackRuns.map((run) => ({ ms: Math.round((run.start + run.end) / 2), black: true })),
    ...cuts.filter((ms) => !inside(ms, blackRuns)).map((ms) => ({ ms, black: false })),
  ]
    .filter((candidate) => candidate.ms <= lastAllowed && !inside(candidate.ms, blocked) && !inside(candidate.ms, speech))
    // Time first, black frames first on a tie: the order is stable whatever the input order.
    .sort((a, b) => a.ms - b.ms || Number(b.black) - Number(a.black));

  const breaks: number[] = [];
  let earliest = firstAfter;
  while (breaks.length < maxBreaks) {
    const first = candidates.find((candidate) => candidate.ms >= earliest);
    if (!first) break;
    const black = candidates.find(
      (candidate) => candidate.black && candidate.ms >= first.ms && candidate.ms <= first.ms + window,
    );
    const chosen = black ?? first;
    breaks.push(chosen.ms);
    earliest = chosen.ms + Math.max(minGap, 1);
  }
  return breaks.map((ms) => ms / 1000);
}
