// Serves the demo ads, the movie and their VAST/VMAP on the local network,
// and logs tracking pixels. For device tests before the files live on S3.
//
// Usage: node serve.mjs --dir MEDIA_DIR [--host LAN_IP] [--port 8080] [--midrolls 139.9,441.2] [--latency 0]
//        [--context FILE] [--sintel-midrolls 162.1,543.1] [--sintel-context FILE]
// --midrolls: mid-roll times in seconds, for example from `make-vmap --local`; the first one
// gets a pod of three ads. vmap/timer.xml keeps fixed times (2:00, 6:00) to compare with.
// --latency MS: answer each VAST/VMAP request after MS milliseconds, like a real ad server
// (for measuring how much preloading saves; the media files are not delayed).
// --context FILE: a JSON array with the context of each mid-roll in vmap/movie.xml, in order
// (null for none): { mood, scene, signals, blockedAdCategories }, the BreakContext of make-vmap.
// --sintel-midrolls, --sintel-context: the same for vmap/sintel.xml, the second title. The default
// context, contexts/sintel.json, is what make-vmap --context-model wrote for these two breaks.
// MEDIA_DIR holds the output of make_ads.py (ads/) and the content movie.
// Needs `npm run build` in tools/make-vmap first.

import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { parseArgs } from 'node:util';

import { buildDocuments } from './documents.mjs';

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    host: { type: 'string' },
    port: { type: 'string', default: '8080' },
    movie: { type: 'string', default: 'tears_of_steel_720p.mp4' },
    midrolls: { type: 'string', default: '120,360' },
    latency: { type: 'string', default: '0' },
    context: { type: 'string' },
    'sintel-midrolls': { type: 'string', default: '162.083,543.125' },
    'sintel-context': { type: 'string', default: new URL('contexts/sintel.json', import.meta.url).pathname },
  },
});
if (!values.dir) {
  console.error('Usage: node serve.mjs --dir MEDIA_DIR [--host IP] [--port 8080]');
  process.exit(2);
}

function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family === 'IPv4' && !item.internal) return item.address;
    }
  }
  return '127.0.0.1';
}

const root = normalize(values.dir);
const base = `http://${values.host ?? lanAddress()}:${values.port}/`;

const latency = Number(values.latency);
if (!(latency >= 0)) {
  console.error('--latency: milliseconds, 0 or more');
  process.exit(2);
}

function times(flag) {
  const list = values[flag].split(',').map(Number);
  if (list.some((time) => !(time > 0))) {
    console.error(`--${flag}: positive times in seconds, for example 139.9,441.2`);
    process.exit(2);
  }
  return list;
}
const readContexts = (file) => (file ? JSON.parse(readFileSync(file, 'utf8')) : []);

const documents = buildDocuments({
  root,
  mediaBase: base,
  pixelBase: base,
  midrolls: times('midrolls'),
  sintelMidrolls: times('sintel-midrolls'),
  contexts: readContexts(values.context),
  sintelContexts: readContexts(values['sintel-context']),
});

const types = { '.mp4': 'video/mp4', '.xml': 'application/xml', '.jpg': 'image/jpeg', '.png': 'image/png' };
const counts = new Map();

function sendFile(request, response, path) {
  const size = statSync(path).size;
  const headers = { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
  if (!range) {
    response.writeHead(200, { ...headers, 'Content-Length': size });
    createReadStream(path).pipe(response);
    return;
  }
  const start = range[1] === '' ? size - Number(range[2]) : Number(range[1]);
  const end = range[1] === '' || range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1);
  if (!(start >= 0 && start <= end)) {
    response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
    return;
  }
  response.writeHead(206, {
    ...headers,
    'Content-Length': end - start + 1,
    'Content-Range': `bytes ${start}-${end}/${size}`,
  });
  createReadStream(path, { start, end }).pipe(response);
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', base);
  const path = decodeURIComponent(url.pathname.slice(1));
  const time = new Date().toISOString().slice(11, 23);

  if (path === 'p') {
    const key = `${url.searchParams.get('ad')} ${url.searchParams.get('e')}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const code = url.searchParams.get('code');
    console.log(`${time} pixel ${key}${code ? ' code=' + code : ''}`);
    response.writeHead(204).end();
    return;
  }
  if (path === 'stats') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(Object.fromEntries(counts), null, 2));
    return;
  }
  const document = documents[path];
  if (document) {
    console.log(`${time} GET ${path}`);
    setTimeout(() => response.writeHead(200, { 'Content-Type': document.type }).end(document.body), latency);
    return;
  }
  const file = normalize(join(root, path));
  if (!file.startsWith(root + sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    sendFile(request, response, file);
  } catch {
    response.writeHead(404).end();
  }
}).listen(Number(values.port), '0.0.0.0', () => {
  console.log(`Serving ${root} at ${base}`);
  console.log(`VMAP: ${base}vmap/movie.xml  movie: ${base}${values.movie}`);
});
