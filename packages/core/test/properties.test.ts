import fc from 'fast-check';
import { parseWebVtt } from '../src/vast/captions';
import { installImagePolyfill } from '../src/vast/polyfill/image';
import { requestVast } from '../src/vast/request/VastRequester';
import { parseTimeOffset, requestVmap } from '../src/vast/request/VmapRequester';
import { FakeClock } from './fakes/FakeClock';
import { FakeHttp } from './fakes/FakeHttp';

// Ad servers and caption files are untrusted input. For any input, the parsers must give a result
// in their documented shape and never throw or leave a promise rejected.

const stamp = fc
  .tuple(fc.integer({ min: 0, max: 2 }), fc.integer({ min: 0, max: 59 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m, s]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.000`);
const vttLine = fc.oneof(
  fc.tuple(stamp, stamp).map(([a, b]) => `${a} --> ${b}`),
  fc.string({ unit: 'binary', maxLength: 40 }),
  fc.constantFrom('', '<v Narrator>Hello</v>', '<<i>b>x<</i>/b>', '<', '>', 'NOTE x', 'WEBVTT'),
);

const xmlPiece = fc.oneof(
  fc.constantFrom(
    '<VAST version="4.2">',
    '</VAST>',
    '<Ad id="1">',
    '</Ad>',
    '<InLine>',
    '</InLine>',
    '<Wrapper>',
    '</Wrapper>',
    '<VASTAdTagURI><![CDATA[https://ads.test/next]]></VASTAdTagURI>',
    '<Creatives><Creative><Linear><Duration>00:00:10</Duration>',
    '<MediaFiles><MediaFile type="video/mp4" width="1280" height="720"><![CDATA[https://a.test/x.mp4]]></MediaFile></MediaFiles>',
    '</Linear></Creative></Creatives>',
    '<vmap:VMAP xmlns:vmap="http://www.iab.net/videosuite/vmap" version="1.0">',
    '</vmap:VMAP>',
    '<vmap:AdBreak timeOffset="start" breakType="linear">',
    '<vmap:AdBreak timeOffset="00:01:00.000" breakType="linear">',
    '</vmap:AdBreak>',
    '<vmap:AdSource><vmap:AdTagURI templateType="vast3"><![CDATA[https://ads.test/vast]]></vmap:AdTagURI></vmap:AdSource>',
    '&bogus;',
    '<![CDATA[',
  ),
  fc.string({ unit: 'binary', maxLength: 20 }),
);
const xmlish = fc.array(xmlPiece, { maxLength: 30 }).map((pieces) => pieces.join(''));

const g = globalThis as Record<string, unknown>;
beforeEach(() => {
  g.window = g;
  delete g.Image;
  installImagePolyfill(new FakeHttp(), g);
});
afterEach(() => {
  delete g.window;
  delete g.Image;
});

describe('parsers on any input', () => {
  it('parseWebVtt gives cues that end after they start, with text and without tags', () => {
    fc.assert(
      fc.property(fc.array(vttLine, { maxLength: 30 }), fc.boolean(), (lines, header) => {
        const cues = parseWebVtt([header ? 'WEBVTT' : '', ...lines].join('\n'));
        for (const cue of cues) {
          expect(cue.end).toBeGreaterThan(cue.start);
          expect(cue.text.length).toBeGreaterThan(0);
          for (const line of cue.text.split('\n')) {
            expect(line).not.toMatch(/<[^<>]*>/);
            expect(line).not.toContain('-->');
          }
        }
        if (!header) {
          expect(cues).toEqual([]);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('parseTimeOffset gives null or a valid offset', () => {
    const offset = fc.oneof(
      fc.string({ unit: 'binary', maxLength: 16 }),
      fc.stringMatching(/^\d{1,3}:\d{1,3}:\d{1,3}(\.\d{1,4})?$/),
      fc.stringMatching(/^-?\d{1,4}(\.\d{1,3})?%$/),
    );
    fc.assert(
      fc.property(offset, (value) => {
        const parsed = parseTimeOffset(value);
        if (parsed?.kind === 'time') {
          expect(Number.isFinite(parsed.seconds) && parsed.seconds > 0).toBe(true);
        }
        if (parsed?.kind === 'percent') {
          expect(parsed.percent > 0 && parsed.percent < 100).toBe(true);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('requestVast resolves to ok, empty or failed for any answer', async () => {
    await fc.assert(
      fc.asyncProperty(xmlish, async (body) => {
        const http = new FakeHttp().on('https://ads.test/vast', { body });
        const result = await requestVast('https://ads.test/vast', { http, clock: new FakeClock() });
        expect(['ok', 'empty', 'failed']).toContain(result.status);
        if (result.status === 'ok') {
          expect(result.ads.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('requestVmap resolves to ok, empty or failed for any answer', async () => {
    await fc.assert(
      fc.asyncProperty(xmlish, async (body) => {
        const http = new FakeHttp().on('https://ads.test/vmap', { body });
        const result = await requestVmap('https://ads.test/vmap', { http, clock: new FakeClock() });
        expect(['ok', 'empty', 'failed']).toContain(result.status);
        if (result.status === 'failed') {
          expect(result.errorCode).toBeGreaterThanOrEqual(1000);
        }
      }),
      { numRuns: 300 },
    );
  });
});
