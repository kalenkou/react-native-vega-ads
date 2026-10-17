// Writes the demo's VAST, VMAP and WebVTT documents as files, for S3 behind CloudFront
// (tools/pixel-collector). deploy-aws.sh runs it with the stack outputs.
//
// Usage: node export-static.mjs --dir MEDIA_DIR --media-base URL/ --pixel-base URL/ --out DIR
//        [--midrolls 139.9,441.2] [--sintel-midrolls 162.1,543.1] [--context FILE] [--sintel-context FILE]
// --media-base: where the media files and these documents will be served (CloudFront), ending with "/".
// --pixel-base: the pixel collector (the Lambda function URL), ending with "/".
// The other options are those of serve.mjs.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { buildDocuments } from './documents.mjs';

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    'media-base': { type: 'string' },
    'pixel-base': { type: 'string' },
    out: { type: 'string' },
    midrolls: { type: 'string', default: '120,360' },
    'sintel-midrolls': { type: 'string', default: '162.083,543.125' },
    context: { type: 'string' },
    'sintel-context': { type: 'string', default: new URL('contexts/sintel.json', import.meta.url).pathname },
  },
});
const url = (name) => {
  const value = values[name] ?? '';
  if (!/^https:\/\/.+\/$/.test(value)) {
    console.error(`--${name}: an https URL ending with "/"`);
    process.exit(2);
  }
  return value;
};
if (!values.dir || !values.out) {
  console.error('Usage: node export-static.mjs --dir MEDIA_DIR --media-base URL/ --pixel-base URL/ --out DIR');
  process.exit(2);
}
const times = (name) => {
  const list = values[name].split(',').map(Number);
  if (list.some((time) => !(time > 0))) {
    console.error(`--${name}: positive times in seconds, for example 139.9,441.2`);
    process.exit(2);
  }
  return list;
};
const readContexts = (file) => (file ? JSON.parse(readFileSync(file, 'utf8')) : []);

const documents = buildDocuments({
  root: values.dir,
  mediaBase: url('media-base'),
  pixelBase: url('pixel-base'),
  midrolls: times('midrolls'),
  sintelMidrolls: times('sintel-midrolls'),
  contexts: readContexts(values.context),
  sintelContexts: readContexts(values['sintel-context']),
});
for (const [path, { body }] of Object.entries(documents)) {
  const file = join(values.out, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
}
console.log(`${Object.keys(documents).length} documents in ${values.out}`);
