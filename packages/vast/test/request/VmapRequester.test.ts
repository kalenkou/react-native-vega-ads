import { readFileSync } from 'fs';
import { parseTimeOffset, requestVmap, VmapResult } from '../../src/request/VmapRequester';
import { installImagePolyfill } from '../../src/polyfill/image';
import { parseXml as defaultParseXml } from '../../src/request/urlHandler';
import { FakeClock } from '../fakes/FakeClock';
import { FakeHttp } from '../fakes/FakeHttp';

const fixture = (name: string): string => readFileSync(`${__dirname}/../../fixtures/vmap/${name}`, 'utf8');
const URL = 'https://ads.test/vmap.xml';

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

async function load(body: string | null, clock = new FakeClock()): Promise<VmapResult> {
  const http = body === null ? new FakeHttp().hang(URL) : new FakeHttp().on(URL, { body });
  return requestVmap(URL, { http, clock });
}

describe('parseTimeOffset (R18)', () => {
  it.each([
    ['start', { kind: 'start' }],
    ['end', { kind: 'end' }],
    ['00:01:30.500', { kind: 'time', seconds: 90.5 }],
    ['01:00:00', { kind: 'time', seconds: 3600 }],
    ['00:00:00', { kind: 'start' }],
    ['50%', { kind: 'percent', percent: 50 }],
    ['0%', { kind: 'start' }],
    ['100%', { kind: 'end' }],
  ])('parses %s', (input, expected) => {
    expect(parseTimeOffset(input)).toEqual(expected);
  });

  it.each(['#2', 'soon', '', null, '120%', '00:61:00', '1:2'])('rejects %p', (input) => {
    expect(parseTimeOffset(input)).toBeNull();
  });
});

describe('requestVmap (R18)', () => {
  it('reads pre-, mid- and post-roll breaks in document order', async () => {
    const result = await load(fixture('pre-mid-post.xml'));
    if (result.status !== 'ok') throw new Error(result.status);
    expect(result.breaks.map((b) => [b.id, b.offset])).toEqual([
      ['preroll', { kind: 'start' }],
      ['mid-1', { kind: 'time', seconds: 90.5 }],
      ['mid-2', { kind: 'percent', percent: 50 }],
      ['postroll', { kind: 'end' }],
    ]);
    expect(result.breaks[0]?.sources.map((s) => s.source)).toEqual([{ kind: 'url', url: 'https://ads.test/pre.xml' }]);
    expect(result.breaks[0]?.sources[0]?.allowMultipleAds).toBe(false);
    expect(result.breaks[1]?.sources[0]?.allowMultipleAds).toBe(true);
  });

  it('sends the break tracking events with the error code macro', async () => {
    const result = await load(fixture('pre-mid-post.xml'));
    if (result.status !== 'ok') throw new Error(result.status);
    const pre = result.breaks[0]?.sources[0];
    pre?.track('breakStart');
    pre?.track('breakEnd');
    pre?.track('error', 1008);
    expect(pixels.requests).toEqual([
      'https://t.test/vmap/pre/start',
      'https://t.test/vmap/pre/end',
      'https://t.test/vmap/pre/error?code=1008',
    ]);
  });

  it('joins AdBreaks that share an offset into one break (standard pod, R17)', async () => {
    const result = await load(fixture('standard-pod.xml'));
    if (result.status !== 'ok') throw new Error(result.status);
    expect(result.breaks).toHaveLength(2);
    expect(result.breaks[0]?.offset).toEqual({ kind: 'time', seconds: 15 });
    expect(result.breaks[0]?.sources.map((s) => s.id)).toEqual(['midroll-1-ad-1', 'midroll-1-ad-2']);
    expect(result.breaks[1]?.sources.map((s) => s.id)).toEqual(['midroll-2-ad-1']);
  });

  it('keeps VAST that is embedded in the VMAP as XML text', async () => {
    const result = await load(fixture('inline-vast.xml'));
    if (result.status !== 'ok') throw new Error(result.status);
    const source = result.breaks[0]?.sources[0]?.source;
    expect(source?.kind).toBe('xml');
    expect(source?.kind === 'xml' && source.xml).toContain('<Ad id="in-vmap">');
  });

  it('skips unsupported breaks and reports 1003, 1000 and 1005 to their error trackers', async () => {
    const result = await load(fixture('unsupported.xml'));
    if (result.status !== 'ok') throw new Error(result.status);
    expect(result.breaks.map((b) => b.id)).toEqual(['ok']);
    expect(pixels.requests.sort()).toEqual([
      'https://t.test/vmap/bad/error?code=1000',
      'https://t.test/vmap/overlay/error?code=1003',
      'https://t.test/vmap/prop/error?code=1005',
    ]);
  });

  it('uses a custom XML parser for the VMAP document', async () => {
    const parseXml = jest.fn((text: string) => defaultParseXml(text));
    const http = new FakeHttp().on(URL, { body: fixture('pre-mid-post.xml') });
    const result = await requestVmap(URL, { http, clock: new FakeClock(), parseXml });
    expect(result.status).toBe('ok');
    expect(parseXml).toHaveBeenCalledTimes(1);
  });

  it('returns no breaks for an empty VMAP', async () => {
    await expect(load(fixture('empty.xml'))).resolves.toEqual({ status: 'empty' });
  });

  it('fails with 1007 on timeout', async () => {
    const clock = new FakeClock();
    const pending = load(null, clock);
    clock.advance(4000);
    await expect(pending).resolves.toEqual({ status: 'failed', errorCode: 1007 });
  });

  it('fails with 1008 on an HTTP error', async () => {
    const http = new FakeHttp().on(URL, { status: 500, body: '' });
    await expect(requestVmap(URL, { http, clock: new FakeClock() })).resolves.toEqual({ status: 'failed', errorCode: 1008 });
  });

  it('fails with 1002 on malformed XML and 1000 when the root is not VMAP', async () => {
    await expect(load('<vmap:VMAP')).resolves.toEqual({ status: 'failed', errorCode: 1002 });
    await expect(load('<VAST version="4.2"/>')).resolves.toEqual({ status: 'failed', errorCode: 1000 });
  });
});
