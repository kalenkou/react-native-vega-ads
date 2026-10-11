#!/usr/bin/env node
// Runs the break-context model on the hand-labelled breaks in labels.json and prints a
// Markdown table: what we saw, what the model said, and whether they agree.
//
//   npm run build
//   node eval/run.mjs --media DIR --context-model FILE --context-mmproj FILE --speech-model FILE
//
// Needs ffmpeg, whisper-cli and llama-mtmd-cli on PATH. Everything runs locally.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { breakContexts, contextSchema, frameArgs, frameTimes, llamaVisionArgs } from '../dist/breakContext.js';
import { whisperTranscript } from '../dist/whisperSpeech.js';

const { values: flags } = parseArgs({
  options: {
    media: { type: 'string' },
    labels: { type: 'string', default: new URL('labels.json', import.meta.url).pathname },
    'context-model': { type: 'string' },
    'context-mmproj': { type: 'string' },
    'speech-model': { type: 'string' },
  },
});
for (const name of ['media', 'context-model', 'context-mmproj', 'speech-model']) {
  if (!flags[name]) throw new Error(`--${name} is required`);
}

const run = (command, args) =>
  new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 256 * 1024 * 1024 }, (error, stdout, stderr) =>
      error ? reject(new Error(`${command} failed: ${error.message}`)) : resolve({ stdout, stderr }),
    );
  });

const vision = { model: flags['context-model'], mmproj: flags['context-mmproj'] };
const { films } = JSON.parse(await readFile(flags.labels, 'utf8'));
const dir = await mkdtemp(join(tmpdir(), 'make-vmap-eval-'));
const rows = [];

try {
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
    const times = film.breaks.map((b) => b.at);
    const contexts = await breakContexts(times, {
      lines,
      frames: async (at) => {
        const images = [];
        for (const time of frameTimes(at)) {
          const out = join(dir, `${at}-${time}.jpg`);
          await run('ffmpeg', frameArgs(file, time, out));
          images.push(out);
        }
        return images;
      },
      ask: (prompt, images) => run('llama-mtmd-cli', llamaVisionArgs(vision, prompt, images, schema)).then((r) => r.stdout),
    });
    film.breaks.forEach((label, index) => {
      const context = contexts[index];
      const said = context?.signals?.map((s) => s.name) ?? [];
      process.stderr.write(`${film.file} ${label.at}: ${said.join(', ') || 'none'}\n`);
      rows.push({ film: film.file, label, context, said });
    });
  }
} finally {
  await rm(dir, { recursive: true, force: true });
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
