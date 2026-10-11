import { readFileSync } from 'fs';
import { requestVast, VastResult } from '../../src/request/VastRequester';
import { installImagePolyfill } from '../../src/polyfill/image';
import { parseXml as defaultParseXml } from '../../src/request/urlHandler';
import { FakeClock } from '../fakes/FakeClock';
import { FakeHttp } from '../fakes/FakeHttp';

const fixture = (name: string): string => readFileSync(`${__dirname}/../../fixtures/vast/${name}`, 'utf8');
const INLINE = 'https://ads.test/inline.xml';

function wrapperTo(next: string, id: string): string {
  return fixture('wrapper-to-inline.xml').replace(INLINE, next).replace(/w1/g, id);
}

/** w1 → w2 → … → wN → inline */
function wrapperChain(http: FakeHttp, length: number): string {
  http.on(INLINE, { body: fixture('inline.xml') });
  for (let i = length; i >= 1; i--) {
    const next = i === length ? INLINE : `https://ads.test/w${i + 1}`;
    http.on(`https://ads.test/w${i}`, { body: wrapperTo(next, `w${i}`) });
  }
  return 'https://ads.test/w1';
}

// React Native has `window` but no `Image`; vast-client sends pixels only when `window` exists.
const g = globalThis as Record<string, unknown>;
let pixels: FakeHttp;
beforeEach(() => {
  pixels = new FakeHttp();
  g.window = g;
  delete g.Image;
  installImagePolyfill(pixels, g);
});
afterEach(() => {
  delete g.window;
  delete g.Image;
});

async function load(http: FakeHttp, url: string, clock = new FakeClock()): Promise<VastResult> {
  return requestVast(url, { http, clock });
}

describe('requestVast', () => {
  it('loads an InLine ad with its linear creative', async () => {
    const result = await load(new FakeHttp().on(INLINE, { body: fixture('inline.xml') }), INLINE);
    if (result.status !== 'ok') throw new Error(result.status);
    expect(result.ads).toHaveLength(1);
    const [first] = result.ads;
    expect(first?.ad.id).toBe('ad-1');
    expect(first?.sequence).toBeNull();
    expect(first?.creative.duration).toBe(10);
    expect(first?.creative.mediaFiles).toHaveLength(4);
    expect(first?.ad.impressionURLTemplates).toHaveLength(2);
  });

  it('follows 3 wrappers and merges their impressions', async () => {
    const http = new FakeHttp();
    const result = await load(http, wrapperChain(http, 3));
    if (result.status !== 'ok') throw new Error(result.status);
    expect(result.ads[0]?.ad.impressionURLTemplates).toHaveLength(2 + 3);
  });

  it('allows 5 wrappers (R3)', async () => {
    const http = new FakeHttp();
    const result = await load(http, wrapperChain(http, 5));
    expect(result.status).toBe('ok');
  });

  it('stops at the 6th wrapper with error 302 and sends it to the wrapper Error URLs', async () => {
    const http = new FakeHttp();
    const result = await load(http, wrapperChain(http, 6));
    expect(result).toEqual({ status: 'empty', errorCodes: [302] });
    expect(http.requests).not.toContain(INLINE);
    expect(pixels.requests.some((url) => url.includes('code=302'))).toBe(true);
  });

  it('treats an empty VAST as no ads with 303 and fires its Error URL (R5)', async () => {
    const result = await load(new FakeHttp().on(INLINE, { body: fixture('empty.xml') }), INLINE);
    expect(result).toEqual({ status: 'empty', errorCodes: [303] });
    expect(pixels.requests).toEqual(['https://t.test/empty?code=303']);
  });

  it('reports 301 when a wrapper target fails', async () => {
    const http = new FakeHttp()
      .on('https://ads.test/w1', { body: wrapperTo('https://ads.test/dead', 'w1') })
      .on('https://ads.test/dead', { status: 500, body: '' });
    const result = await load(http, 'https://ads.test/w1');
    expect(result).toEqual({ status: 'empty', errorCodes: [301] });
  });

  it('reports 100 for a document that is not VAST', async () => {
    const result = await load(new FakeHttp().on(INLINE, { body: fixture('not-vast.xml') }), INLINE);
    expect(result).toEqual({ status: 'failed', errorCode: 100, failure: { kind: 'xml' } });
  });

  it('reports 100 for malformed XML', async () => {
    const result = await load(new FakeHttp().on(INLINE, { body: '<VAST><Ad>' }), INLINE);
    expect(result).toEqual({ status: 'failed', errorCode: 100, failure: { kind: 'xml' } });
  });

  it('skips the break when the first request fails, without an error code to send (R4)', async () => {
    const result = await load(new FakeHttp().on(INLINE, { status: 503, body: '' }), INLINE);
    expect(result).toEqual({ status: 'failed', errorCode: null, failure: { kind: 'http', status: 503 } });
  });

  it('skips the break on a first-request timeout', async () => {
    const clock = new FakeClock();
    const pending = load(new FakeHttp().hang(INLINE), INLINE, clock);
    clock.advance(4000);
    await expect(pending).resolves.toEqual({ status: 'failed', errorCode: null, failure: { kind: 'timeout' } });
  });

  it('accepts VAST 2 responses', async () => {
    const result = await load(new FakeHttp().on(INLINE, { body: fixture('vast2.xml') }), INLINE);
    expect(result.status).toBe('ok');
  });

  it('keeps pod ads with their sequence numbers and buffet ads without', async () => {
    const result = await load(new FakeHttp().on(INLINE, { body: fixture('pod-optimized.xml') }), INLINE);
    if (result.status !== 'ok') throw new Error(result.status);
    expect(result.ads.map((a) => [a.ad.id, a.sequence])).toEqual([
      ['pod-2', 2],
      ['pod-1', 1],
      ['buffet', null],
    ]);
    expect(result.ads.find((a) => a.ad.id === 'pod-1')?.creative.skipDelay).toBe(5);
  });

  it('drops pod ads behind a wrapper that does not allow multiple ads, keeping the stand-alone ad', async () => {
    const http = new FakeHttp()
      .on('https://ads.test/w1', { body: wrapperTo('https://ads.test/pod', 'w1') })
      .on('https://ads.test/pod', { body: fixture('pod-optimized.xml') });
    const result = await load(http, 'https://ads.test/w1');
    if (result.status !== 'ok') throw new Error(result.status);
    expect(result.ads.map((a) => a.ad.id)).toEqual(['buffet']);
  });

  it('rejects an ad without a linear creative with 200 and fires its Error URL', async () => {
    const result = await load(new FakeHttp().on(INLINE, { body: fixture('nonlinear-only.xml') }), INLINE);
    expect(result).toEqual({ status: 'empty', errorCodes: [200] });
    expect(pixels.requests).toEqual(['https://t.test/err-nl?code=200']);
  });

  it.each([
    ['no skipoffset', '<Linear>', null],
    ['an unparseable skipoffset (Google sends this)', '<Linear skipoffset="">', null],
    ['a time skipoffset', '<Linear skipoffset="00:00:05">', 5],
    ['a percent skipoffset', '<Linear skipoffset="25%">', 2.5],
  ])('normalises skipAfter for %s', async (_label, linear, expected) => {
    const body = fixture('inline.xml').replace('<Linear>', linear);
    const result = await load(new FakeHttp().on(INLINE, { body }), INLINE);
    if (result.status !== 'ok') throw new Error(result.status);
    expect(result.ads[0]?.skipAfter).toBe(expected);
  });

  it('parses VAST embedded in a VMAP without a network request', async () => {
    const http = new FakeHttp();
    const result = await requestVast({ kind: 'xml', xml: fixture('inline.xml') }, { http, clock: new FakeClock() });
    if (result.status !== 'ok') throw new Error(result.status);
    expect(result.ads[0]?.ad.id).toBe('ad-1');
    expect(http.requests).toEqual([]);
  });

  it('follows a wrapper found in embedded VAST', async () => {
    const http = new FakeHttp().on(INLINE, { body: fixture('inline.xml') });
    const result = await requestVast({ kind: 'xml', xml: wrapperTo(INLINE, 'w1') }, { http, clock: new FakeClock() });
    expect(result.status).toBe('ok');
    expect(http.requests).toEqual([INLINE]);
  });

  it('reports 100 for broken embedded VAST', async () => {
    const result = await requestVast({ kind: 'xml', xml: '<VAST><Ad>' }, { http: new FakeHttp(), clock: new FakeClock() });
    expect(result).toEqual({ status: 'failed', errorCode: 100, failure: { kind: 'xml' } });
  });

  it('passes a custom XML parser to every document of the chain, embedded VAST included', async () => {
    const seen: string[] = [];
    const parseXml = (text: string): Document | null => {
      seen.push(text.includes('<Wrapper>') ? 'wrapper' : 'inline');
      return defaultParseXml(text);
    };
    const http = new FakeHttp().on(INLINE, { body: fixture('inline.xml') });
    const result = await requestVast({ kind: 'xml', xml: wrapperTo(INLINE, 'w1') }, { http, clock: new FakeClock(), parseXml });
    expect(result.status).toBe('ok');
    expect(seen).toEqual(['wrapper', 'inline']);
  });

  it('adds a cache-busting value to the ad tag when it has the macro', async () => {
    const http = new FakeHttp();
    const result = await requestVast('https://ads.test/tag?cb=[CACHEBUSTING]', { http, clock: new FakeClock(), random: () => 0.12345678 });
    expect(result.status).toBe('failed');
    expect(http.requests[0]).toBe('https://ads.test/tag?cb=12345678');
  });

  it('fills app macros, [TIMESTAMP] and [CACHEBUSTING] in the ad tag and in every wrapper URL (C1-1)', async () => {
    const tag = 'https://ads.test/w1?lat=[LIMITADTRACKING]&ifa=[IFA]&ts=[TIMESTAMP]&cb=[CACHEBUSTING]&x=[UNKNOWN]';
    const next = 'https://ads.test/inline.xml?lat=[LIMITADTRACKING]&cb=[CACHEBUSTING]';
    const http = new FakeHttp()
      .on('https://ads.test/w1?lat=0&ifa=a%2Fb%20c&ts=2026-10-11T12%3A00%3A00.000Z&cb=12345678&x=[UNKNOWN]', { body: wrapperTo(next, 'w1') })
      .on('https://ads.test/inline.xml?lat=0&cb=12345678', { body: fixture('inline.xml') });
    const result = await requestVast(tag, {
      http,
      clock: new FakeClock(Date.parse('2026-10-11T12:00:00Z')),
      random: () => 0.12345678,
      macros: { LIMITADTRACKING: '0', IFA: 'a/b c' },
    });
    expect(http.requests).toEqual([
      'https://ads.test/w1?lat=0&ifa=a%2Fb%20c&ts=2026-10-11T12%3A00%3A00.000Z&cb=12345678&x=[UNKNOWN]',
      'https://ads.test/inline.xml?lat=0&cb=12345678',
    ]);
    expect(result.status).toBe('ok');
  });

  it.each([
    ['an ad without a linear creative (200)', 'nonlinear-only.xml', 'https://t.test/err-nl?code=200&ifa=abc'],
    ['an empty VAST (303, sent by vast-client)', 'empty.xml', 'https://t.test/empty?code=303&ifa=abc'],
  ])('fills the app macros in the Error URL of %s (C1-5)', async (_label, name, expected) => {
    const body = fixture(name).replace('?code=[ERRORCODE]', '?code=[ERRORCODE]&ifa=[IFA]');
    await requestVast(INLINE, { http: new FakeHttp().on(INLINE, { body }), clock: new FakeClock(), macros: { IFA: 'abc' } });
    expect(pixels.requests).toEqual([expected]);
  });
});
