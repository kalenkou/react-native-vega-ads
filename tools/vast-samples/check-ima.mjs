#!/usr/bin/env node
// Google's public IMA sample ad tags (Google Ad Manager test network) through
// react-native-ads-core: VAST, wrapper, skippable, VMAP with pre-, mid- and post-rolls, pods.
// Usage: node check-ima.mjs (plain GET requests to pubads.g.doubleclick.net).
// Tags from https://developers.google.com/interactive-media-ads/docs/sdks/html5/client-side/tags
// Needs `npm run build -w packages/core` first.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const core = require(join(dirname(fileURLToPath(import.meta.url)), '../../packages/core/dist/index.js'));
const clock = { now: () => Date.now(), setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (h) => clearTimeout(h) };
const http = {
  async get(url) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const t = await r.text();
      return { status: r.status, ok: r.ok, text: async () => t };
    } catch {
      return { status: 599, ok: false, text: async () => '' };
    }
  },
};
const B = 'https://pubads.g.doubleclick.net/gampad/ads?';
// Google asks for a new correlator on every request (a repeated one gets no ad): the core fills
// [CACHEBUSTING] with a new random number for each request, as an app's ad tag would use it.
const tag = (query) => B + query;
const vast = {
  'single linear': 'iu=/21775744923/external/single_ad_samples&sz=640x480&cust_params=sample_ct%3Dlinear&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&impl=s&correlator=[CACHEBUSTING]',
  'single skippable': 'iu=/21775744923/external/single_preroll_skippable&sz=640x480&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&impl=s&correlator=[CACHEBUSTING]',
  'single redirect linear (wrapper)': 'iu=/21775744923/external/single_ad_samples&sz=640x480&cust_params=sample_ct%3Dredirectlinear&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&impl=s&correlator=[CACHEBUSTING]',
  'single redirect error (wrapper)': 'iu=/21775744923/external/single_ad_samples&sz=640x480&cust_params=sample_ct%3Dredirecterror&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&impl=s&nofb=1&correlator=[CACHEBUSTING]',
};
const vmap = {
  'VMAP pre/mid/post': 'iu=/21775744923/external/vmap_ad_samples&sz=640x480&cust_params=sample_ar%3Dpremidpost&ciu_szs=300x250&gdfp_req=1&ad_rule=1&output=vmap&unviewed_position_start=1&env=vp&impl=s&cmsid=496&vid=short_onecue&correlator=[CACHEBUSTING]',
  'VMAP pre/mid pod/post': 'iu=/21775744923/external/vmap_ad_samples&sz=640x480&cust_params=sample_ar%3Dpremidpostpod&ciu_szs=300x250&gdfp_req=1&ad_rule=1&output=vmap&unviewed_position_start=1&env=vp&impl=s&cmsid=496&vid=short_onecue&correlator=[CACHEBUSTING]',
};
  for (const [name, q] of Object.entries(vast)) {
    const r = await core.requestVast({ kind: 'url', url: tag(q) }, { http, clock, timeoutMs: 8000 });
    const ad = r.status === 'ok' ? r.ads[0] : null;
    const f = ad ? core.selectMediaFile(ad.creative.mediaFiles) : null;
    console.log(`${name}: ${r.status} ${ad ? `ads=${r.ads.length} dur=${ad.creative.duration} skip=${ad.skipAfter} file=${f.file ? f.file.mimeType + ' ' + f.file.height + 'p ' + (f.file.codec || '') : 'none ' + f.errorCode}` : JSON.stringify(r.errorCodes ?? r.errorCode)}`);
  }
  for (const [name, q] of Object.entries(vmap)) {
    const m = await core.requestVmap(tag(q), { http, clock, timeoutMs: 8000 });
    if (m.status !== 'ok') { console.log(`${name}: ${m.status} ${m.errorCode ?? ''}`); continue; }
    const parts = [];
    for (const b of m.breaks) {
      const results = await Promise.all(b.sources.map((s) => core.requestVast(s.source, { http, clock, timeoutMs: 8000 })));
      const ads = results.flatMap((r) => (r.status === 'ok' ? r.ads : []));
      const playable = ads.filter((a) => core.selectMediaFile(a.creative.mediaFiles).file).length;
      parts.push(`${b.offset.kind === 'time' ? b.offset.seconds + 's' : b.offset.kind}: ${playable}/${ads.length} playable`);
    }
    console.log(`${name}: ${m.breaks.length} breaks · ${parts.join(' · ')}`);
  }
