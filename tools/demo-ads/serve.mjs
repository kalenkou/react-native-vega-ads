// Serves the demo ads, the movie and their VAST/VMAP on the local network,
// and logs tracking pixels. For device tests before the files live on S3.
//
// Usage: node serve.mjs --dir MEDIA_DIR [--host LAN_IP] [--port 8080] [--midrolls 139.9,441.2]
// --midrolls: mid-roll times in seconds, for example from `make-vmap --local`; the first one
// gets a pod of three ads. vmap/timer.xml keeps fixed times (2:00, 6:00) to compare with.
// MEDIA_DIR holds the output of make_ads.py (ads/) and the content movie.
// Needs `npm run build` in tools/make-vmap first.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildVast } = require('../make-vmap/dist/buildVast.js');
const { buildVmap } = require('../make-vmap/dist/buildVmap.js');

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    host: { type: 'string' },
    port: { type: 'string', default: '8080' },
    movie: { type: 'string', default: 'tears_of_steel_720p.mp4' },
    midrolls: { type: 'string', default: '120,360' },
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

const ads = {
  kettlo: { title: 'Kettlo', seconds: 10 },
  brewnord: { title: 'Brewnord', seconds: 15 },
  voltaro: { title: 'Voltaro', seconds: 12 },
};

function ad(id, skipAfterSeconds) {
  const sizes = [
    [1920, 1080, 'ads/' + id + '_1080p.mp4'],
    [1280, 720, 'ads/' + id + '_720p.mp4'],
  ];
  return {
    id,
    title: ads[id].title,
    durationSeconds: ads[id].seconds,
    skipAfterSeconds,
    pixelBaseUrl: base,
    mediaFiles: sizes.map(([width, height, path]) => ({
      url: base + path,
      width,
      height,
      bitrateKbps: Math.round((statSync(join(root, path)).size * 8) / ads[id].seconds / 1000),
    })),
  };
}

const midrollTimes = values.midrolls.split(',').map(Number);
if (midrollTimes.some((time) => !(time > 0))) {
  console.error('--midrolls: positive times in seconds, for example 139.9,441.2');
  process.exit(2);
}

const vmap = (times) =>
  buildVmap({
    preroll: base + 'vast/single.xml',
    midrolls: times.map((time, index) => ({ time, vastUrl: base + (index === 0 ? 'vast/pod.xml' : 'vast/single.xml') })),
    postroll: base + 'vast/single.xml',
  });

const documents = {
  'vast/single.xml': buildVast([ad('kettlo', 5)]),
  'vast/pod.xml': buildVast([ad('brewnord'), ad('voltaro', 5), ad('kettlo')]),
  'vmap/movie.xml': vmap(midrollTimes),
  'vmap/timer.xml': vmap([120, 360]),
};

const types = { '.mp4': 'video/mp4', '.xml': 'application/xml', '.jpg': 'image/jpeg' };
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
  response.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}` });
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
  if (documents[path]) {
    console.log(`${time} GET ${path}`);
    response.writeHead(200, { 'Content-Type': 'application/xml' }).end(documents[path]);
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
