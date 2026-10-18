#!/usr/bin/env node
// "Ads as usual" against make-vmap, on the same films and the same detection:
//  - timer: a mid-roll every 5 minutes wherever the film is. One start time is luck, so every
//    start from 2:00 to 6:59 (300 timers, one per second) is counted;
//  - make-vmap: its default rules (first after 2:00, at least 5 minutes apart), with speech.
// A break "cuts a line" when it falls inside speech that whisper.cpp found, or within a second
// of it (the margin make-vmap keeps). It "cuts a shot" when no hard cut or black frames are
// within half a second of it.
// Usage: node timer.mjs --speech-model ggml-base.en.bin FILM.mp4 [FILM.mp4 ...]
// Needs ffmpeg and whisper-cli; `npm run build -w tools/make-vmap` first.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const dist = join(dirname(fileURLToPath(import.meta.url)), '../dist');
const { ffmpegSegments } = require(join(dist, 'ffmpegSegments.js'));
const { whisperTranscript } = require(join(dist, 'whisperSpeech.js'));
const { pickBreaks } = require(join(dist, 'pickBreaks.js'));
const { TempDirs } = require(join(dist, 'tempDirs.js'));

const args = process.argv.slice(2);
const at = args.indexOf('--speech-model');
if (at < 0 || !args[at + 1]) {
  console.error('Usage: node timer.mjs --speech-model ggml-base.en.bin FILM.mp4 [FILM.mp4 ...]');
  process.exit(2);
}
const model = args[at + 1];
const films = args.filter((_, i) => i !== at && i !== at + 1);

const run = (command, maxBuffer) => (argv) =>
  new Promise((resolve, reject) => {
    execFile(command, argv, { maxBuffer }, (error, _stdout, stderr) =>
      error ? reject(new Error(`${command}: ${error.message}`)) : resolve(stderr),
    );
  });
const runFfmpeg = run('ffmpeg', 256 * 1024 * 1024);
const temp = new TempDirs(tmpdir());
const whisper = {
  runFfmpeg,
  runWhisper: async (argv) => void (await run('whisper-cli', 64 * 1024 * 1024)(argv)),
  readFile: (path) => readFile(path, 'utf8'),
  makeTempDir: () => temp.make('make-vmap-timer-'),
  removeDir: (path) => temp.remove(path),
};

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const percent = (part, whole) => `${Math.round((100 * part) / whole)} %`;

for (const film of films) {
  const detection = await ffmpegSegments(film, runFfmpeg);
  const { speech, lines } = await whisperTranscript(film, model, whisper);
  const duration = detection.durationSeconds;
  const edges = detection.segments.flatMap((x) =>
    x.Type === 'SHOT'
      ? [x.StartTimestampMillis]
      : x.TechnicalCueSegment?.Type === 'BlackFrames'
        ? [x.StartTimestampMillis, x.EndTimestampMillis]
        : [],
  );
  const blackRuns = detection.segments.filter((x) => x.TechnicalCueSegment?.Type === 'BlackFrames');
  const cutsLine = (s) => speech.some((x) => s * 1000 >= x.startMs - 1000 && s * 1000 <= x.endMs + 1000);
  const cutsShot = (s) =>
    !blackRuns.some((x) => s * 1000 >= x.StartTimestampMillis && s * 1000 <= x.EndTimestampMillis) &&
    !edges.some((ms) => Math.abs(ms - s * 1000) <= 500);
  const lineAt = (s) => lines.find((l) => s * 1000 >= l.startMs - 1000 && s * 1000 <= l.endMs + 1000);
  const speechShare = speech.reduce((sum, x) => sum + (x.endMs - x.startMs), 0) / 1000 / duration;

  let timerBreaks = 0;
  let timerLines = 0;
  let timerShots = 0;
  for (let first = 120; first < 420; first += 1) {
    for (let s = first; s <= duration - 60; s += 300) {
      timerBreaks += 1;
      if (cutsLine(s)) timerLines += 1;
      if (cutsShot(s)) timerShots += 1;
    }
  }
  const ours = pickBreaks(detection.segments, { durationSeconds: duration, speech });

  console.log(`\n${basename(film)} · ${clock(duration)} · speech ${percent(speechShare, 1)} of the film`);
  console.log(`  timer, every 5 min, 300 start times: ${timerBreaks} breaks`);
  console.log(`    cut a line: ${timerLines} (${percent(timerLines, timerBreaks)})`);
  console.log(`    cut a shot: ${timerShots} (${percent(timerShots, timerBreaks)})`);
  const example = [];
  for (let s = 300; s <= duration - 60; s += 300) example.push(s);
  for (const s of example) {
    const line = cutsLine(s) ? lineAt(s) : null;
    console.log(
      `    e.g. from 5:00: ${clock(s)} ${line ? `cuts "${line.text.trim()}"` : cutsLine(s) ? 'cuts a line' : 'clear of speech'}${cutsShot(s) ? ', mid-shot' : ''}`,
    );
  }
  console.log(
    `  make-vmap: ${ours.length} breaks, ${ours.filter(cutsLine).length} cut a line, ${ours.filter(cutsShot).length} cut a shot`,
  );
  for (const s of ours) console.log(`    ${clock(s)}`);
}
