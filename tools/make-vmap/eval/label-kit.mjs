#!/usr/bin/env node
// Makes a page to label the breaks of an eval set blind: for every break, the 30 s of film
// before it and a checkbox per signal. The page shows no earlier labels and no model answers.
// "Save" downloads the labels as JSON in the format of labels.json.
//
//   node eval/label-kit.mjs --media DIR --labels eval/labels.json --out DIR
//   open DIR/index.html
//
// Needs ffmpeg on PATH.
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';

const WINDOW = 30;

/** The signals of src/breakContext.ts, with what counts as each one. */
const SIGNALS = [
  ['weapons', 'A gun, knife, sword or other weapon is clearly seen or used. Not a toy or a tool.'],
  ['violence', 'Someone hits, shoots, fights or attacks; blasts in a fight.'],
  ['injury', 'A wound, blood, or someone visibly hurt.'],
  ['death', 'Someone dies, or a dead body is shown.'],
  ['grief', 'Someone mourns or cries over a loss.'],
  ['vehicle crash', 'A car, plane or other vehicle crashes.'],
  ['drinking', 'People drink alcohol or are drunk.'],
  ['child in danger', 'A child is threatened, hurt or in danger.'],
];

const { values: flags } = parseArgs({
  options: {
    media: { type: 'string' },
    labels: { type: 'string', default: new URL('labels.json', import.meta.url).pathname },
    out: { type: 'string' },
    // A second labeller gets their own file name, so two people's labels never mix.
    labeller: { type: 'string' },
  },
});
for (const name of ['media', 'out']) {
  if (!flags[name]) throw new Error(`--${name} is required`);
}

const run = (command, args) =>
  new Promise((resolve, reject) => {
    execFile(command, args, (error) => (error ? reject(new Error(`${command} failed: ${error.message}`)) : resolve()));
  });

const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

const { films } = JSON.parse(await readFile(flags.labels, 'utf8'));
const labeller = flags.labeller ? flags.labeller.replace(/[^A-Za-z0-9_-]/g, '') : '';
await mkdir(join(flags.out, 'clips'), { recursive: true });
const breaks = [];
for (const film of films) {
  for (const { at } of film.breaks) {
    const start = Math.max(0, at - WINDOW);
    const clip = `clips/${basename(film.file, '.mp4')}-${Math.round(at)}.mp4`;
    process.stderr.write(`${clip}\n`);
    await run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', String(start), '-i', join(flags.media, film.file), '-t', String(at - start),
      '-vf', 'scale=854:-2', '-c:v', 'libx264', '-crf', '26', '-preset', 'veryfast',
      '-c:a', 'aac', '-ac', '2', '-b:a', '96k', join(flags.out, clip),
    ]);
    breaks.push({ file: film.file, at, clip, label: `${basename(film.file, '.mp4')} · break at ${clock(at)}` });
  }
}

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Label breaks</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 900px; margin: 24px auto; padding: 0 16px; }
  section { border-top: 1px solid #ccc; padding: 16px 0; }
  video { width: 100%; background: #000; }
  label { display: inline-block; margin: 4px 16px 4px 0; }
  dt { font-weight: 600; } dd { margin: 0 0 6px 0; }
  .done { color: #0a7d32; }
  button { font-size: 16px; padding: 8px 20px; }
</style></head><body>
<h1>Label the breaks</h1>
<p>Each clip is the 30 s of film right before an ad break. Watch it with sound. Tick every signal you clearly see or hear in it, also in the background. Tick none if there is none. Tick "unsure" when it is a judgement call, and say why in the note.</p>
<dl>${SIGNALS.map(([name, rule]) => `<dt>${name}</dt><dd>${rule}</dd>`).join('')}</dl>
<p><button id="save">Save labels</button> <span id="count"></span></p>
${breaks
  .map(
    (b, i) => `<section data-i="${i}"><h2>${i + 1}. ${b.label}</h2>
<video controls preload="metadata" src="${b.clip}"></video>
<div>${SIGNALS.map(([name]) => `<label><input type="checkbox" value="${name}"> ${name}</label>`).join('')}</div>
<div><label><input type="checkbox" class="unsure"> unsure</label> <label><input type="checkbox" class="checked"> done</label></div>
<input class="seen" placeholder="What you saw, a few words" style="width: 100%"></section>`,
  )
  .join('\n')}
<script>
const BREAKS = ${JSON.stringify(breaks.map(({ file, at }) => ({ file, at })))};
const KEY = 'label-kit:' + location.pathname;
const sections = [...document.querySelectorAll('section')];
function read() {
  return sections.map((s) => ({
    signals: [...s.querySelectorAll('input[value]')].filter((c) => c.checked).map((c) => c.value),
    unsure: s.querySelector('.unsure').checked,
    done: s.querySelector('.checked').checked,
    seen: s.querySelector('.seen').value.trim(),
  }));
}
function show() {
  const done = read().filter((b) => b.done).length;
  document.getElementById('count').textContent = done + ' of ' + sections.length + ' done';
  sections.forEach((s, i) => s.querySelector('h2').classList.toggle('done', read()[i].done));
}
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved) sections.forEach((s, i) => {
    const b = saved[i]; if (!b) return;
    s.querySelectorAll('input[value]').forEach((c) => { c.checked = b.signals.includes(c.value); });
    s.querySelector('.unsure').checked = b.unsure;
    s.querySelector('.checked').checked = b.done;
    s.querySelector('.seen').value = b.seen;
  });
} catch {}
document.addEventListener('input', () => {
  try { localStorage.setItem(KEY, JSON.stringify(read())); } catch {}
  show();
});
document.getElementById('save').onclick = () => {
  const labels = read();
  const films = [];
  BREAKS.forEach((b, i) => {
    let film = films.find((f) => f.file === b.file);
    if (!film) films.push((film = { file: b.file, breaks: [] }));
    const { signals, unsure, seen } = labels[i];
    film.breaks.push({ at: b.at, signals, seen, ...(unsure ? { unsure: true } : {}) });
  });
  const about = 'Labelled blind from the 30 s of film before each break (label-kit.mjs)' + ${JSON.stringify(labeller ? ` by ${labeller}` : '')} + ', ' + new Date().toISOString().slice(0, 10) + '.';
  const blob = new Blob([JSON.stringify({ about, films }, null, 2) + '\\n'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = ${JSON.stringify(labeller ? `labels-blind-${labeller}.json` : 'labels-blind.json')};
  a.click();
};
show();
</script></body></html>
`;
await writeFile(join(flags.out, 'index.html'), page);
process.stderr.write(`open ${join(flags.out, 'index.html')}\n`);
