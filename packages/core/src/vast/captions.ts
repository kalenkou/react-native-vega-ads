import type { LinearAd } from './request/VastRequester';

/** One WebVTT cue: seconds from the ad's start, and its text (lines joined with "\n"). */
export interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

const TIMING = /^((?:\d+:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d+:)?\d{2}:\d{2}\.\d{3})(?:\s|$)/;

/** "01:02:03.500" or "02:03.500" in seconds. */
function seconds(stamp: string): number {
  return stamp.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

/**
 * The cues of a WebVTT file (VAST `<ClosedCaptionFiles>`, or whisper.cpp `-ovtt`). Cue settings,
 * NOTE and STYLE blocks are ignored, voice and style tags are dropped, and a cue whose timing
 * cannot be read is skipped. A file without the WEBVTT header gives no cues.
 */
export function parseWebVtt(vtt: string): CaptionCue[] {
  const lines = vtt.replace(/^﻿/, '').split(/\r?\n/);
  if (!/^WEBVTT(\s|$)/.test(lines[0] ?? '')) {
    return [];
  }
  const cues: CaptionCue[] = [];
  for (let i = 1; i < lines.length; i++) {
    const timing = TIMING.exec(lines[i] ?? '');
    if (!timing) {
      continue;
    }
    const text: string[] = [];
    while (i + 1 < lines.length && lines[i + 1]?.trim() !== '') {
      text.push((lines[++i] ?? '').replace(/<[^>]*>/g, '').trim());
    }
    const start = seconds(timing[1] ?? '');
    const end = seconds(timing[2] ?? '');
    if (end > start && text.length > 0) {
      cues.push({ start, end, text: text.join('\n') });
    }
  }
  return cues;
}

/** The caption on screen at `time`: cues cover [start, end); overlapping cues are joined. */
export function captionAt(cues: readonly CaptionCue[], time: number): string {
  return cues
    .filter((cue) => cue.start <= time && time < cue.end)
    .map((cue) => cue.text)
    .join('\n');
}

/**
 * The ad's WebVTT caption file from `<ClosedCaptionFiles>`: the one in `language` (matched on its
 * primary subtag, so "en-US" finds "en"), else the first WebVTT file. Null when there is none.
 */
export function captionFileUrl(linear: LinearAd, language?: string): string | null {
  const vtt = (linear.creative.closedCaptionFiles ?? [])
    .map((f) => ({
      url: f.fileURL?.trim() ?? '',
      type: f.type?.toLowerCase() ?? '',
      language: f.language?.toLowerCase() ?? '',
    }))
    .filter((f) => f.url !== '' && (f.type === 'text/vtt' || (f.type === '' && /\.vtt(\?|$)/i.test(f.url))));
  const wanted = language?.toLowerCase().split('-')[0];
  return (vtt.find((f) => wanted && f.language.split('-')[0] === wanted) ?? vtt[0])?.url ?? null;
}
