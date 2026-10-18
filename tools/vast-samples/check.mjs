#!/usr/bin/env node
// Runs every IAB Tech Lab VAST sample through react-native-ads-core: the same request,
// wrapper and media file code the player uses, without a device.
// Usage: sh get_samples.sh && node check.mjs [--online]
//   --online  follows wrappers to their real ad tag URLs (plain GET requests); without it
//             a wrapper whose target is not one of the samples counts as unreachable.
// Exit code 1 when a sample with a plain H.264 mp4 video does not play.
// Needs `npm run build -w packages/core` first.
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const core = require(join(here, '../../packages/core/dist/index.js'));
const root = join(here, 'samples');
const online = process.argv.includes('--online');
const BASE = 'https://samples.local/';

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.xml')) files.push(path);
  }
})(root);

const http = {
  async get(url) {
    if (url.startsWith(BASE)) {
      const body = readFileSync(join(root, decodeURIComponent(url.slice(BASE.length))), 'utf8');
      return { status: 200, ok: true, text: async () => body };
    }
    if (online) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const body = await response.text();
        return { status: response.status, ok: response.ok, text: async () => body };
      } catch {
        // falls through: unreachable
      }
    }
    return { status: 599, ok: false, text: async () => '' };
  },
};
const clock = { now: () => Date.now(), setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (h) => clearTimeout(h) };

/** What the sample is, from its XML: what a player should be able to do with it. */
function kind(xml) {
  if (/<VAST[^>]*version="1/.test(xml) || /<VideoAdServingTemplate/.test(xml)) return 'VAST 1.0 (not supported)';
  if (/<Wrapper[\s>]/.test(xml)) return 'wrapper';
  if (!/<Linear[\s>]/.test(xml)) return 'no linear ad (non-linear or companion only)';
  const videos = [...xml.matchAll(/<MediaFile\b[^>]*>/g)].map((m) => m[0]);
  const h264 = (tag) => !/codec="/i.test(tag) || /codec="\s*(avc[13]?[^"]*|h\.?264|0)\s*"/i.test(tag);
  const plainMp4 = videos.some(
    (tag) => /type="video\/mp4"/i.test(tag) && !/apiFramework="(?!VAST")/i.test(tag) && h264(tag),
  );
  return plainMp4 ? 'linear video, H.264 mp4' : 'linear, no H.264 mp4 (VPAID, Flash or audio)';
}

const rows = [];
for (const file of files.sort()) {
  const name = relative(root, file);
  const what = kind(readFileSync(file, 'utf8'));
  const result = await core.requestVast(
    { kind: 'url', url: BASE + encodeURIComponent(name) },
    { http, clock, timeoutMs: 8000 },
  );
  let outcome;
  if (result.status === 'ok') {
    const choice = core.selectMediaFile(result.ads[0].creative.mediaFiles);
    outcome = choice.file ? `plays ${choice.file.height || '?'}p mp4` : `no playable file (${choice.errorCode})`;
  } else if (result.status === 'empty') {
    outcome = `no ad (VAST error ${result.errorCodes.join(', ')})`;
  } else {
    outcome = `not parsed${result.errorCode ? ` (VAST error ${result.errorCode})` : ''}`;
  }
  rows.push({ name, what, outcome });
}

const groups = new Map();
for (const row of rows) {
  const plays = row.outcome.startsWith('plays');
  const key = row.what;
  const group = groups.get(key) ?? { total: 0, plays: 0 };
  group.total += 1;
  if (plays) group.plays += 1;
  groups.set(key, group);
}
for (const row of rows) console.log(`${row.outcome.padEnd(34)} ${row.what.padEnd(44)} ${row.name}`);
console.log('');
for (const [what, g] of groups) console.log(`${what}: ${g.plays} of ${g.total} play`);

const failed = rows.filter((r) => r.what === 'linear video, H.264 mp4' && !r.outcome.startsWith('plays'));
if (failed.length > 0) {
  console.log(`\n${failed.length} sample(s) with an mp4 video did not play:`);
  failed.forEach((r) => console.log(`  ${r.name}: ${r.outcome}`));
  process.exitCode = 1;
}
