import { join } from 'node:path';
import type { FfmpegRunner } from './ffmpegSegments';
import type { SpeechInterval } from './pickBreaks';

/** Runs whisper-cli (whisper.cpp) with these arguments. */
export type WhisperRunner = (args: string[]) => Promise<void>;

export interface WhisperTools {
  /** Runs ffmpeg; here it only extracts the audio track. */
  runFfmpeg: FfmpegRunner;
  runWhisper: WhisperRunner;
  readFile(path: string): Promise<string>;
  /** Creates an empty temporary folder and resolves with its path. */
  makeTempDir(): Promise<string>;
  /** Removes a folder and everything in it. */
  removeDir(path: string): Promise<void>;
}

/** Words closer than this are one stretch of speech. */
const MERGE_GAP_MS = 400;

/** whisper.cpp reads 16 kHz mono 16-bit WAV. */
export function audioArgs(file: string, wav: string): string[] {
  return ['-hide_banner', '-nostats', '-loglevel', 'error', '-y', '-i', file, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav];
}

/**
 * Full JSON (`-ojf`) has a time for every token. `-mc 0` starts every 30 s window without the
 * text of the previous one: with that context whisper repeats a line over music for minutes.
 */
export function whisperArgs(model: string, wav: string, outBase: string): string[] {
  return ['-m', model, '-f', wav, '-mc', '0', '-ojf', '-of', outBase, '-np'];
}

interface WhisperToken {
  text?: string;
  offsets?: { from?: number; to?: number };
}

interface WhisperJson {
  transcription?: Array<{ offsets?: { from?: number; to?: number }; text?: string; tokens?: WhisperToken[] }>;
}

/** One whisper segment: a line of dialogue or a sound label such as `(somber music)`. */
export interface TimedLine {
  startMs: number;
  endMs: number;
  text: string;
}

/** The text of each segment with its time, for reading what was said before a break. */
export function parseWhisperLines(json: string): TimedLine[] {
  const data = JSON.parse(json) as WhisperJson;
  return (data.transcription ?? [])
    .map((segment) => ({ startMs: segment.offsets?.from ?? 0, endMs: segment.offsets?.to ?? 0, text: (segment.text ?? '').trim() }))
    .filter((line) => line.text !== '');
}

/**
 * Reads whisper-cli full JSON as stretches of speech (ascending, merged). Word times come from the
 * tokens: a segment's own times can include seconds of silence. Labels such as `[MUSIC PLAYING]`,
 * `(somber music)`, `*screams*` and `♪` are not speech; punctuation belongs to the word before it,
 * because whisper often gives the words no length and the time to the `?` or `.` after them.
 */
export function parseWhisperJson(json: string): SpeechInterval[] {
  const data = JSON.parse(json) as WhisperJson;
  if (!Array.isArray(data.transcription)) throw new Error('whisper output has no transcription');

  const words: SpeechInterval[] = [];
  for (const segment of data.transcription) {
    let current: SpeechInterval | undefined;
    let label: string | undefined; // the closing character of the label we are in
    for (const token of segment.tokens ?? []) {
      const text = token.text ?? '';
      const from = token.offsets?.from;
      const to = token.offsets?.to;
      if (text.startsWith('[_') || from === undefined || to === undefined) continue; // [_BEG_], [_TT_150]
      let spoken = false;
      let inLabel = label !== undefined;
      for (const char of text) {
        if (label !== undefined) {
          if (char === label) label = undefined;
        } else if (char === '[' || char === '(' || char === '*') {
          label = char === '[' ? ']' : char === '(' ? ')' : '*';
          inLabel = true;
        } else if (char === '♪') {
          inLabel = true;
        } else if (/[\p{L}\p{N}]/u.test(char)) {
          spoken = true;
        }
      }
      if (spoken) {
        if (current) current.endMs = to;
        else words.push((current = { startMs: from, endMs: to }));
      } else if (inLabel) {
        current = undefined;
      } else if (current) {
        current.endMs = to; // punctuation after a word
      }
    }
  }

  words.sort((a, b) => a.startMs - b.startMs);
  const merged: SpeechInterval[] = [];
  for (const word of words) {
    const last = merged[merged.length - 1];
    if (last && word.startMs - last.endMs < MERGE_GAP_MS) last.endMs = Math.max(last.endMs, word.endMs);
    else merged.push({ ...word });
  }
  return merged;
}

/**
 * Where people speak in a local video file, found by whisper.cpp ($0, no cloud). The audio goes
 * to a temporary WAV file, which is removed afterwards, also on failure.
 */
export async function whisperSpeech(file: string, model: string, tools: WhisperTools): Promise<SpeechInterval[]> {
  return (await whisperTranscript(file, model, tools)).speech;
}

/** Speech stretches and the lines with their text, from one whisper.cpp run. */
export async function whisperTranscript(
  file: string,
  model: string,
  tools: WhisperTools,
): Promise<{ speech: SpeechInterval[]; lines: TimedLine[] }> {
  const dir = await tools.makeTempDir();
  try {
    const wav = join(dir, 'audio.wav');
    const outBase = join(dir, 'speech');
    await tools.runFfmpeg(audioArgs(file, wav));
    await tools.runWhisper(whisperArgs(model, wav, outBase));
    const json = await tools.readFile(`${outBase}.json`);
    return { speech: parseWhisperJson(json), lines: parseWhisperLines(json) };
  } finally {
    await tools.removeDir(dir);
  }
}
