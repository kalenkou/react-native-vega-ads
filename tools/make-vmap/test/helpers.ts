import type { Segment } from '../src/segments';

/** A SHOT segment between two times in seconds. */
export function shot(startSeconds: number, endSeconds: number, confidence = 99): Segment {
  return {
    Type: 'SHOT',
    StartTimestampMillis: Math.round(startSeconds * 1000),
    EndTimestampMillis: Math.round(endSeconds * 1000),
    ShotSegment: { Confidence: confidence },
  };
}

/** A TECHNICAL_CUE segment between two times in seconds. */
export function cue(type: string, startSeconds: number, endSeconds: number, confidence = 90): Segment {
  return {
    Type: 'TECHNICAL_CUE',
    StartTimestampMillis: Math.round(startSeconds * 1000),
    EndTimestampMillis: Math.round(endSeconds * 1000),
    TechnicalCueSegment: { Type: type, Confidence: confidence },
  };
}

/** Back-to-back shots that cover [0, end) with a cut every `every` seconds. */
export function shotsEvery(every: number, end: number): Segment[] {
  const result: Segment[] = [];
  for (let start = 0; start < end; start += every) {
    result.push(shot(start, Math.min(start + every, end)));
  }
  return result;
}
