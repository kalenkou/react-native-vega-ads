import { DOMParser } from '@xmldom/xmldom';
import { requestVmap } from '../../../packages/core/src/vast/request/VmapRequester';
import { FakeClock } from '../../../packages/core/test/fakes/FakeClock';
import { FakeHttp } from '../../../packages/core/test/fakes/FakeHttp';
import { appendCustParams, buildVmap, formatTimeOffset } from '../src/buildVmap';

const VMAP_NS = 'http://www.iab.net/videosuite/vmap';
const VMAP_URL = 'https://cdn.test/breaks.vmap';

function parse(xml: string): Document {
  const errors: string[] = [];
  const doc = new DOMParser({
    errorHandler: { warning: () => undefined, error: (m) => errors.push(m), fatalError: (m) => errors.push(m) },
  }).parseFromString(xml, 'text/xml');
  expect(errors).toEqual([]);
  return doc as unknown as Document;
}

async function load(xml: string) {
  const http = new FakeHttp().on(VMAP_URL, { body: xml });
  return requestVmap(VMAP_URL, { http, clock: new FakeClock() });
}

describe('formatTimeOffset', () => {
  it.each([
    [1, '00:00:01.000'],
    [90.5, '00:01:30.500'],
    [3723.0456, '01:02:03.046'],
    [21599.9996, '06:00:00.000'],
    [36000, '10:00:00.000'],
  ])('formats %p seconds as %s', (seconds, text) => {
    expect(formatTimeOffset(seconds)).toBe(text);
  });

  it('rejects times that are not positive', () => {
    expect(() => formatTimeOffset(0)).toThrow(RangeError);
    expect(() => formatTimeOffset(-1)).toThrow(RangeError);
    expect(() => formatTimeOffset(Number.NaN)).toThrow(RangeError);
    expect(() => formatTimeOffset(0.0001)).toThrow(RangeError);
  });
});

describe('appendCustParams', () => {
  it('adds an encoded cust_params value: values encoded once, then the whole list encoded again', () => {
    // Inner list: scene=car%20chase&tags=a%26b,c%3Dd (a comma separates the values of one key).
    expect(appendCustParams('https://ads.test/vast?iu=/1/x', { scene: 'car chase', tags: ['a&b', 'c=d'] })).toBe(
      'https://ads.test/vast?iu=/1/x&cust_params=scene%3Dcar%2520chase%26tags%3Da%2526b%2Cc%253Dd',
    );
  });

  it('starts a query when there is none and keeps the fragment last', () => {
    expect(appendCustParams('https://ads.test/vast#top', { k: 'v' })).toBe('https://ads.test/vast?cust_params=k%3Dv#top');
    expect(appendCustParams('https://ads.test/vast?', { k: 'v' })).toBe('https://ads.test/vast?cust_params=k%3Dv');
  });

  it('keeps ad server macros in the original URL untouched', () => {
    expect(appendCustParams('https://ads.test/vast?correlator=[timestamp]', { k: 'v' })).toBe(
      'https://ads.test/vast?correlator=[timestamp]&cust_params=k%3Dv',
    );
  });

  it('returns the URL unchanged when there are no params', () => {
    expect(appendCustParams('https://ads.test/vast', undefined)).toBe('https://ads.test/vast');
    expect(appendCustParams('https://ads.test/vast', {})).toBe('https://ads.test/vast');
  });
});

describe('buildVmap', () => {
  const pre = 'https://ads.test/vast?pos=pre&sz=640x480';
  const mid = 'https://ads.test/vast?pos=mid';
  const post = 'https://ads.test/vast?pos=post';

  it('writes a VMAP 1.0 document with pre-, mid- and post-rolls', () => {
    const xml = buildVmap({
      preroll: pre,
      midrolls: [
        { time: 900.25, vastUrl: mid },
        { time: 300, vastUrl: mid },
      ],
      postroll: post,
    });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);

    const doc = parse(xml);
    const root = doc.documentElement;
    expect(root.localName).toBe('VMAP');
    expect(root.namespaceURI).toBe(VMAP_NS);
    expect(root.getAttribute('version')).toBe('1.0');

    const breaks = Array.from(doc.getElementsByTagNameNS(VMAP_NS, 'AdBreak'));
    expect(breaks.map((b) => [b.getAttribute('timeOffset'), b.getAttribute('breakId'), b.getAttribute('breakType')])).toEqual([
      ['start', 'preroll', 'linear'],
      ['00:05:00.000', 'midroll-1', 'linear'],
      ['00:15:00.250', 'midroll-2', 'linear'],
      ['end', 'postroll', 'linear'],
    ]);
    const tags = Array.from(doc.getElementsByTagNameNS(VMAP_NS, 'AdTagURI'));
    expect(tags.map((tag) => tag.getAttribute('templateType'))).toEqual(['vast4', 'vast4', 'vast4', 'vast4']);
    expect(tags.map((tag) => (tag.textContent ?? '').trim())).toEqual([pre, mid, mid, post]);
  });

  it('is read by the vast package VMAP requester with the same breaks', async () => {
    const xml = buildVmap({
      preroll: pre,
      midrolls: [{ time: 600.5, vastUrl: mid, custParams: { scene: 'beach' } }],
      postroll: post,
    });
    const result = await load(xml);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.breaks.map((b) => ({ id: b.id, offset: b.offset, sources: b.sources.map((s) => s.source) }))).toEqual([
      { id: 'preroll', offset: { kind: 'start' }, sources: [{ kind: 'url', url: pre }] },
      {
        id: 'midroll-1',
        offset: { kind: 'time', seconds: 600.5 },
        sources: [{ kind: 'url', url: `${mid}&cust_params=scene%3Dbeach` }],
      },
      { id: 'postroll', offset: { kind: 'end' }, sources: [{ kind: 'url', url: post }] },
    ]);
    expect(result.breaks.every((b) => b.sources.every((s) => s.allowMultipleAds))).toBe(true);
  });

  it('accepts pre- and post-rolls with their own custParams', async () => {
    const xml = buildVmap({
      preroll: { vastUrl: pre, custParams: { pos: 'pre' } },
      midrolls: [],
      postroll: { vastUrl: post },
    });
    const result = await load(xml);
    expect(result.status === 'ok' && result.breaks.map((b) => b.sources[0]!.source)).toEqual([
      { kind: 'url', url: `${pre}&cust_params=pos%3Dpre` },
      { kind: 'url', url: post },
    ]);
  });

  it('writes an empty VMAP when there are no breaks', async () => {
    const xml = buildVmap({ midrolls: [] });
    expect(parse(xml).getElementsByTagNameNS(VMAP_NS, 'AdBreak').length).toBe(0);
    await expect(load(xml)).resolves.toEqual({ status: 'empty' });
  });

  it('keeps a URL that contains a CDATA terminator intact', async () => {
    const odd = 'https://ads.test/vast?x=]]>&y=<z>';
    const result = await load(buildVmap({ midrolls: [{ time: 10, vastUrl: odd }] }));
    expect(result.status === 'ok' && result.breaks[0]!.sources[0]!.source).toEqual({ kind: 'url', url: odd });
  });

  it('rejects two mid-rolls at the same time and invalid URLs', () => {
    expect(() =>
      buildVmap({
        midrolls: [
          { time: 60, vastUrl: mid },
          { time: 60.0001, vastUrl: mid },
        ],
      }),
    ).toThrow(/same time/);
    expect(() => buildVmap({ midrolls: [{ time: 60, vastUrl: 'not a url' }] })).toThrow(/URL/);
    expect(() => buildVmap({ preroll: '', midrolls: [] })).toThrow(/URL/);
    expect(() => buildVmap({ postroll: 'ftp://ads.test/vast.xml', midrolls: [] })).toThrow(/http or https/);
  });
});

describe('buildVmap break context', () => {
  it('writes what the scene before a break blocks, so the player leaves those ads out', async () => {
    const xml = buildVmap({
      midrolls: [
        {
          time: 139.917,
          vastUrl: 'https://ads.test/mid.xml',
          context: {
            mood: 'violent',
            scene: 'Robots fight <soldiers> & fire',
            signals: [
              { name: 'vehicle crash', evidence: 'A car hits a <wall>.' },
              { name: 'injury', evidence: 'A soldier bleeds.' },
            ],
            blockedAdCategories: ['1551', '1571'],
          },
        },
        { time: 441.2, vastUrl: 'https://ads.test/mid2.xml' },
      ],
    });
    parse(xml);
    expect(xml).toContain('<Scene>Robots fight &lt;soldiers&gt; &amp; fire</Scene>');
    expect(xml).toContain('<Mood>violent</Mood>');
    expect(xml).toContain('<Signal name="vehicle crash">A car hits a &lt;wall&gt;.</Signal>');
    const result = await load(xml);
    expect(result.status === 'ok' && result.breaks.map((b) => b.blockedAdCategories)).toEqual([['1551', '1571'], undefined]);
    expect(result.status === 'ok' && result.breaks.map((b) => b.sceneSignals)).toEqual([['vehicle crash', 'injury'], undefined]);
  });

  it('writes the mood even when nothing is blocked, and refuses a bad category code', () => {
    const xml = buildVmap({ midrolls: [{ time: 60, vastUrl: 'https://ads.test/m.xml', context: { mood: 'calm & warm', blockedAdCategories: [] } }] });
    expect(xml).toContain('<Mood>calm &amp; warm</Mood>');
    expect(xml).not.toContain('BlockedAdCategories');
    expect(() =>
      buildVmap({ midrolls: [{ time: 60, vastUrl: 'https://ads.test/m.xml', context: { mood: 'calm', blockedAdCategories: ['15 51'] } }] }),
    ).toThrow(TypeError);
  });
});

