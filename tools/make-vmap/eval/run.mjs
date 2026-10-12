#!/usr/bin/env node
// Runs the break-context model on the hand-labelled breaks in labels.json and prints a
// Markdown table: what we saw, what the model said, and whether they agree.
//
//   npm run build
//   node eval/run.mjs --media DIR --context-model FILE --context-mmproj FILE --speech-model FILE
//   node eval/run.mjs --media DIR --context-server http://127.0.0.1:8091 --speech-model FILE
//
// --frames 28,21,14,7,2 and --frame-width 960 change which frames the model sees;
// --plain-prompt leaves out what counts as each signal (the prompt before the eval).
// --films a.mp4,b.mp4 runs only those films. --answers-out FILE saves the model's answers;
// --answers-in FILE compares saved answers with the labels without running any model.
// Needs ffmpeg, whisper-cli and llama-mtmd-cli (or a running llama-server) on PATH. Everything runs locally.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { breakContexts, contextSchema, frameArgs, frameTimes, llamaServerRequest, llamaVisionArgs } from '../dist/breakContext.js';
import { whisperTranscript } from '../dist/whisperSpeech.js';

const { values: flags } = parseArgs({
  options: {
    media: { type: 'string' },
    labels: { type: 'string', default: new URL('labels.json', import.meta.url).pathname },
    'context-model': { type: 'string' },
    'context-mmproj': { type: 'string' },
    'context-server': { type: 'string' },
    'speech-model': { type: 'string' },
    films: { type: 'string' },
    frames: { type: 'string' },
    'frame-width': { type: 'string' },
    'plain-prompt': { type: 'boolean' },
    'answers-out': { type: 'string' },
    'answers-in': { type: 'string' },
  },
});
const useModel = !flags['answers-in'];
const required = useModel
  ? ['media', 'speech-model', ...(flags['context-server'] ? [] : ['context-model', 'context-mmproj'])]
  : [];
for (const name of required) {
  if (!flags[name]) throw new Error(`--${name} is required`);
}

const run = (command, args) =>
  new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 256 * 1024 * 1024 }, (error, stdout, stderr) =>
      error ? reject(new Error(`${command} failed: ${error.message}`)) : resolve({ stdout, stderr }),
    );
  });

const vision = { model: flags['context-model'], mmproj: flags['context-mmproj'] };
// --frames 28,21,14,7,2 (seconds before the break) and --frame-width 960 try other frame sets.
const offsets = flags.frames?.split(',').map(Number);
const frameWidth = flags['frame-width'] ? Number(flags['frame-width']) : undefined;
const only = flags.films?.split(',');
const films = JSON.parse(await readFile(flags.labels, 'utf8')).films.filter((film) => !only || only.includes(film.file));
const dir = await mkdtemp(join(tmpdir(), 'make-vmap-eval-'));
const rows = [];

/** Asks a running llama-server (started with --reasoning off). */
async function askServer(prompt, images) {
  const jpegs = await Promise.all(images.map((image) => readFile(image)));
  const response = await fetch(`${flags['context-server']}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(llamaServerRequest(prompt, jpegs, contextSchema())),
  });
  if (!response.ok) throw new Error(`llama-server answered ${response.status}`);
  return (await response.json()).choices[0].message.content;
}

const saved = flags['answers-in'] ? JSON.parse(await readFile(flags['answers-in'], 'utf8')) : null;

/** The answers saved by an earlier run, matched to the labelled breaks. */
function savedRows() {
  return films.flatMap((film) =>
    film.breaks.map((label) => {
      const context = saved.answers.find((a) => a.film === film.file && a.at === label.at)?.context ?? null;
      return { film: film.file, label, context, said: context?.signals?.map((s) => s.name) ?? [] };
    }),
  );
}

/** Runs whisper.cpp and the vision model on each film's breaks. */
async function modelRows() {
  const result = [];
  const schema = join(dir, 'schema.json');
  await writeFile(schema, JSON.stringify(contextSchema()));
  for (const film of films) {
    const file = join(flags.media, film.file);
    process.stderr.write(`${film.file}: transcribing\n`);
    const { lines } = await whisperTranscript(file, flags['speech-model'], {
      runFfmpeg: (args) => run('ffmpeg', args).then((r) => r.stderr),
      runWhisper: (args) => run('whisper-cli', args).then(() => undefined),
      readFile: (path) => readFile(path, 'utf8'),
      makeTempDir: () => mkdtemp(join(dir, 'whisper-')),
      removeDir: (path) => rm(path, { recursive: true, force: true }),
    });
    const contexts = await breakContexts(
      film.breaks.map((b) => b.at),
      {
        lines,
        prompt: { definitions: !flags['plain-prompt'] },
        frames: async (at) => {
          const images = [];
          for (const time of frameTimes(at, offsets)) {
            const out = join(dir, `${at}-${time}.jpg`);
            await run('ffmpeg', frameArgs(file, time, out, frameWidth));
            images.push(out);
          }
          return images;
        },
        ask: flags['context-server']
          ? askServer
          : (prompt, images) => run('llama-mtmd-cli', llamaVisionArgs(vision, prompt, images, schema)).then((r) => r.stdout),
      },
    );
    film.breaks.forEach((label, index) => {
      const context = contexts[index];
      process.stderr.write(`${film.file} ${label.at}: done\n`);
      result.push({ film: film.file, label, context, said: context?.signals?.map((s) => s.name) ?? [] });
    });
  }
  return result;
}

try {
  rows.push(...(saved ? savedRows() : await modelRows()));
} finally {
  await rm(dir, { recursive: true, force: true });
}

if (flags['answers-out']) {
  const answers = rows.map(({ film, label, context }) => ({ film, at: label.at, context }));
  const model = flags['context-server'] ? flags['context-server'] : flags['context-model'];
  await writeFile(flags['answers-out'], `${JSON.stringify({ model, answers }, null, 2)}\n`);
  process.stderr.write(`Saved ${answers.length} answers to ${flags['answers-out']}\n`);
}

// Without labels (the break points only) there is nothing to compare yet.
if (!rows.every((r) => Array.isArray(r.label.signals))) {
  process.exit(0);
}

const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const cell = (text) => String(text).replace(/\|/g, '\\|');

console.log('| Film | Break | Labelled | Model | Evidence | Match |');
console.log('|---|---|---|---|---|---|');
for (const { film, label, context, said } of rows) {
  const match = !context ? 'no answer' : same(label.signals, said) ? 'yes' : label.signals.length > 0 === said.length > 0 ? 'partly' : 'no';
  const evidence = context?.signals?.map((s) => `${s.name}: ${s.evidence}`).join('; ') || '';
  const labelled = (label.signals.join(', ') || 'none') + (label.unsure ? ' (unsure)' : '');
  console.log(`| ${film.split('_')[0]} | ${mmss(label.at)} | ${labelled} | ${said.join(', ') || 'none'} | ${cell(evidence)} | ${match} |`);
}

const answered = rows.filter((r) => r.context);
const flagged = (signals) => signals.length > 0;
const exact = answered.filter((r) => same(r.label.signals, r.said)).length;
const sameFlag = answered.filter((r) => flagged(r.label.signals) === flagged(r.said)).length;
const falseBlocks = answered.filter((r) => !flagged(r.label.signals) && flagged(r.said)).length;
const missed = answered.filter((r) => flagged(r.label.signals) && !flagged(r.said)).length;
console.log('');
console.log(`Breaks: ${rows.length}, answered: ${answered.length}.`);
console.log(`Same signals: ${exact}/${answered.length}. Same "sensitive or not": ${sameFlag}/${answered.length}.`);
console.log(`Blocked a calm break: ${falseBlocks}. Missed a sensitive break: ${missed}.`);
