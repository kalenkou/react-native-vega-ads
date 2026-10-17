// The demo's VAST, VMAP and WebVTT documents, for serve.mjs (local network) and
// export-static.mjs (files for S3 behind CloudFront). Needs `npm run build` in tools/make-vmap.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildPauseVast, buildVast } = require('../make-vmap/dist/buildVast.js');
const { buildVmap } = require('../make-vmap/dist/buildVmap.js');

// category: what the ad sells, IAB Ad Product Taxonomy 2.0 (a break can block it).
// line: the ad's on-screen line (make_ads.py), also its caption.
const ads = {
  kettlo: { title: 'Kettlo', seconds: 10, category: '1524', line: 'Kettlebells that last a lifetime' }, // Sporting Goods
  brewnord: { title: 'Brewnord', seconds: 15, category: '1133', line: 'Slow coffee for long evenings' }, // Coffee and Tea
  voltaro: { title: 'Voltaro', seconds: 12, category: '1571', line: 'Charge at home. Drive all week.' }, // Electric Vehicles
  ferntop: { title: 'Ferntop', seconds: 10, category: '1070', line: 'Trail shoes for wet mornings' }, // Footwear
  quillary: { title: 'Quillary', seconds: 12, category: '1203', line: 'Notebooks that open flat' }, // Office/School Supplies
};

/** WebVTT captions of a demo ad: its music (the ads have tones, no speech), then its line. */
function captionFile(id) {
  const { title, seconds, line } = ads[id];
  const stamp = (s) => `00:${String(Math.floor(s)).padStart(2, '0')}.000`;
  return ['WEBVTT', '', `${stamp(0)} --> ${stamp(2)}`, '[calm music]', '', `${stamp(2)} --> ${stamp(seconds)}`, `${title}: ${line}`, ''].join('\n');
}

/**
 * Every document by its path. `mediaBase`: where the media files and these documents are
 * served, ending with "/". `pixelBase`: the pixel collector, ending with "/" (the same server
 * locally, the Lambda function URL on AWS). `root`: the media folder (make_ads.py, get_media.sh).
 */
export function buildDocuments({ root, mediaBase, pixelBase, midrolls, sintelMidrolls, contexts = [], sintelContexts = [] }) {
  // Measured by get_media.sh (EBU R128). Without the file the ads carry no loudness and play as they are.
  const loudnessFile = join(root, 'loudness.json');
  const loudness = existsSync(loudnessFile) ? JSON.parse(readFileSync(loudnessFile, 'utf8')) : {};

  const ad = (id, skipAfterSeconds) => ({
    id,
    title: ads[id].title,
    durationSeconds: ads[id].seconds,
    skipAfterSeconds,
    pixelBaseUrl: pixelBase,
    advertiser: ads[id].title,
    universalAdId: { idRegistry: 'vega-ads-demo', value: id },
    loudnessLufs: loudness['ads/' + id + '_720p.mp4'],
    categories: [ads[id].category],
    captions: [{ url: mediaBase + 'captions/' + id + '.en.vtt', language: 'en' }],
    mediaFiles: [
      [1920, 1080, 'ads/' + id + '_1080p.mp4'],
      [1280, 720, 'ads/' + id + '_720p.mp4'],
    ].map(([width, height, path]) => ({
      url: mediaBase + path,
      width,
      height,
      bitrateKbps: Math.round((statSync(join(root, path)).size * 8) / ads[id].seconds / 1000),
    })),
  });

  const vmap = (times, withContext = []) =>
    buildVmap({
      preroll: mediaBase + 'vast/single.xml',
      midrolls: times.map((time, index) => ({
        time,
        vastUrl: mediaBase + (index === 0 ? 'vast/pod.xml' : 'vast/ferntop.xml'),
        context: withContext[index] ?? undefined,
      })),
      postroll: mediaBase + 'vast/quillary.xml',
    });

  const xml = {
    // Kettlo, with Ferntop standing by: a household that saw Kettlo in the last 30 minutes, in any
    // title, gets Ferntop instead.
    'vast/single.xml': buildVast([ad('kettlo', 5), ad('ferntop', 5)], { buffet: true }),
    // Kettlo again, as when two ad sources sell the same creative: the player leaves it out.
    'vast/pod.xml': buildVast([ad('brewnord'), ad('voltaro', 5), ad('kettlo')]),
    'vast/ferntop.xml': buildVast([ad('ferntop', 5)]),
    'vast/quillary.xml': buildVast([ad('quillary')]),
    // Pause ad (IAB CTV Ad Portfolio): drawn by make_ads.py; the QR code points to a .example address.
    'vast/pause.xml': buildPauseVast({
      id: 'brewnord-pause',
      title: 'Brewnord pause',
      imageUrl: mediaBase + 'ads/brewnord_pause.png',
      width: 600,
      height: 600,
      advertiser: 'Brewnord',
      qr: { scanUrl: 'https://brewnord.example/pause', imageUrl: mediaBase + 'ads/brewnord_qr.png' },
      pixelBaseUrl: pixelBase,
    }),
    'vmap/movie.xml': vmap(midrolls, contexts),
    'vmap/sintel.xml': vmap(sintelMidrolls, sintelContexts),
    'vmap/timer.xml': vmap([120, 360]),
    // Ads as usual, to compare with: a mid-roll on a timer that cuts a line of Tears of Steel at
    // 0:32 ("...that you're freaked out | by my robot hand?"), and the pre-roll's ad again in it.
    // The app plays it without loudness guard and without no-repeat rules.
    'vast/classic-pre.xml': buildVast([ad('kettlo', 5)]),
    'vast/classic-mid.xml': buildVast([ad('kettlo'), ad('brewnord', 5)]),
    'vmap/classic.xml': buildVmap({
      preroll: mediaBase + 'vast/classic-pre.xml',
      midrolls: [{ time: 32, vastUrl: mediaBase + 'vast/classic-mid.xml' }],
    }),
  };
  const documents = {};
  for (const [path, body] of Object.entries(xml)) documents[path] = { type: 'application/xml', body };
  for (const id of Object.keys(ads)) documents['captions/' + id + '.en.vtt'] = { type: 'text/vtt', body: captionFile(id) };
  return documents;
}
