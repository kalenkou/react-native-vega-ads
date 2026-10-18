import { installImagePolyfill } from '../src/vast/polyfill/image';
import type { ClockPort, HttpPort } from '../src/vast/ports';
import { requestVast } from '../src/vast/request/VastRequester';
import { requestVmap } from '../src/vast/request/VmapRequester';
import { selectMediaFile } from '../src/vast/request/mediaFileSelector';

// Public samples from the Google IMA docs. Responses are not stored anywhere.
const BASE =
  'https://pubads.g.doubleclick.net/gampad/ads?sz=640x480&ciu_szs=300x250%2C728x90&gdfp_req=1&unviewed_position_start=1&env=vp&impl=s&correlator=[CACHEBUSTING]';
const single = (sampleCt: string): string =>
  `${BASE}&iu=${encodeURIComponent('/21775744923/external/single_ad_samples')}&cust_params=sample_ct%3D${sampleCt}&output=vast`;
const SKIPPABLE = `${BASE}&iu=${encodeURIComponent('/21775744923/external/single_preroll_skippable')}&output=vast`;
const vmap = (sampleAr: string): string =>
  `${BASE}&iu=${encodeURIComponent('/21775744923/external/vmap_ad_samples')}&cust_params=sample_ar%3D${sampleAr}&ad_rule=1&output=vmap&cmsid=496&vid=short_onecue`;

const http: HttpPort = {
  get: async (url, options) => {
    const response = await fetch(url, { signal: options?.signal });
    return { status: response.status, ok: response.ok, text: () => response.text() };
  },
};
const clock: ClockPort = {
  now: () => Date.now(),
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
};

const pixels: string[] = [];
const g = globalThis as Record<string, unknown>;
beforeAll(() => {
  g.window = g;
  delete g.Image;
  installImagePolyfill(
    {
      get: async (url) => {
        pixels.push(url);
        return { status: 204, ok: true, text: async () => '' };
      },
    },
    g,
  );
});
afterAll(() => {
  delete g.window;
  delete g.Image;
});

function summary(result: Awaited<ReturnType<typeof requestVast>>): string {
  if (result.status !== 'ok') return JSON.stringify(result);
  return result.ads
    .map((a) => {
      const choice = selectMediaFile(a.creative.mediaFiles);
      return `ad=${a.ad.id} seq=${a.sequence} dur=${a.creative.duration}s skipAfter=${a.skipAfter} files=${a.creative.mediaFiles.length} pick=${choice.file ? `${choice.file.height}p ${choice.file.mimeType}` : choice.errorCode}`;
    })
    .join(' | ');
}

describe('live Google IMA sample tags', () => {
  it.each([
    ['single inline linear', single('linear'), 'ok'],
    ['single skippable', SKIPPABLE, 'ok'],
    ['single redirect (wrapper)', single('redirectlinear'), 'ok'],
    ['redirect error', single('redirecterror'), 'empty'],
  ])('%s', async (label, url, expected) => {
    const result = await requestVast(url, { http, clock });
    console.log(`${label}: ${summary(result)} errors=${'errorCodes' in result ? result.errorCodes.join(',') : '-'}`);
    expect(result.status).toBe(expected);
    if (result.status === 'ok') {
      for (const ad of result.ads) {
        expect(selectMediaFile(ad.creative.mediaFiles).file).toBeDefined();
      }
    }
  });

  it('skippable sample has a skip offset', async () => {
    const result = await requestVast(SKIPPABLE, { http, clock });
    if (result.status !== 'ok') throw new Error(JSON.stringify(result));
    expect(result.ads[0]?.skipAfter).toBeGreaterThan(0);
  });

  it.each([['premidpost'], ['premidpostpod'], ['premidpostoptimizedpod'], ['premidpostlongpod']])(
    'VMAP %s',
    async (sampleAr) => {
      const result = await requestVmap(vmap(sampleAr).replace('[CACHEBUSTING]', String(Date.now())), { http, clock });
      if (result.status !== 'ok') throw new Error(JSON.stringify(result));
      const lines: string[] = [];
      for (const adBreak of result.breaks) {
        for (const source of adBreak.sources) {
          const vast = await requestVast(source.source, { http, clock });
          lines.push(`  ${adBreak.id} ${JSON.stringify(adBreak.offset)} src=${source.source.kind} → ${summary(vast)}`);
          expect(vast.status).toBe('ok');
        }
      }
      console.log(`VMAP ${sampleAr}: ${result.breaks.length} breaks\n${lines.join('\n')}`);
    },
  );

  afterAll(() =>
    console.log(`error pixels sent: ${pixels.filter((p) => /error|ERRORCODE|errorcode/i.test(p)).length}`),
  );
});
