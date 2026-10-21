// Builds the web demo into dist/: the page, its script and a copy of the demo CDN's VAST, VMAP
// and WebVTT files (the CDN sends no CORS headers, so the page reads them from its own origin).
//
// Usage: node build.mjs [--out DIR]

import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({ options: { out: { type: 'string', default: join(here, 'dist') } } });
const out = values.out;

const CDN = 'https://d3f9mqgmbcpau1.cloudfront.net/';
/** The documents the page asks for first; the ones they point to are found by following their URLs. */
const ENTRIES = ['vmap/movie.xml', 'vmap/classic.xml', 'vmap/sintel.xml', 'vast/pause.xml'];
const LINKED = new RegExp(`${CDN.replace(/[.]/g, '\\.')}([\\w./-]+\\.(?:xml|vtt))`, 'g');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(here, 'src/main.ts')],
  bundle: true,
  minify: true,
  sourcemap: true,
  format: 'iife',
  target: 'es2020',
  platform: 'browser',
  outfile: join(out, 'main.js'),
  alias: { 'react-native-ads-core': join(here, '../../packages/core/src/index.ts') },
  logLevel: 'warning',
});
for (const file of ['index.html', 'style.css']) {
  copyFileSync(join(here, file), join(out, file));
}

const queue = [...ENTRIES];
const seen = new Set(queue);
while (queue.length > 0) {
  const path = queue.shift();
  const response = await fetch(CDN + path);
  if (!response.ok) {
    throw new Error(`${CDN}${path}: HTTP ${response.status}`);
  }
  const body = await response.text();
  const file = join(out, 'cdn', path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
  for (const [, linked] of body.matchAll(LINKED)) {
    if (!seen.has(linked)) {
      seen.add(linked);
      queue.push(linked);
    }
  }
}
console.log(`dist: page, script and ${seen.size} CDN documents in ${out}`);
