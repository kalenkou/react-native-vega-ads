import { requestVast } from '../../../packages/vast/src/request/VastRequester';
import { FakeClock } from '../../../packages/vast/test/fakes/FakeClock';
import { FakeHttp } from '../../../packages/vast/test/fakes/FakeHttp';
import { buildVast, VastAdInput } from '../src/buildVast';

const VAST_URL = 'https://cdn.test/ads/pod.xml';
const PIXELS = 'https://px.test/';

const ad = (id: string, overrides: Partial<VastAdInput> = {}): VastAdInput => ({
  id,
  title: `Demo ad ${id}`,
  durationSeconds: 15,
  mediaFiles: [
    { url: `https://cdn.test/ads/${id}-1080.mp4`, width: 1920, height: 1080, bitrateKbps: 4500 },
    { url: `https://cdn.test/ads/${id}-720.mp4`, width: 1280, height: 720, bitrateKbps: 2000 },
  ],
  pixelBaseUrl: PIXELS,
  ...overrides,
});

async function load(xml: string) {
  const g = globalThis as Record<string, unknown>;
  delete g.window; // no pixels while parsing
  const result = await requestVast(VAST_URL, { http: new FakeHttp().on(VAST_URL, { body: xml }), clock: new FakeClock() });
  if (result.status !== 'ok') throw new Error(result.status);
  return result.ads;
}

describe('buildVast', () => {
  it('writes a VAST 4 InLine ad that vega-ads reads: duration, media files, skip offset', async () => {
    const [parsed] = await load(buildVast([ad('tos-a', { skipAfterSeconds: 5 })]));
    expect(parsed?.creative.duration).toBe(15);
    expect(parsed?.skipAfter).toBe(5);
    expect(parsed?.sequence).toBeNull();
    expect(parsed?.creative.mediaFiles.map((f) => [f.fileURL, f.width, f.height, f.bitrate, f.mimeType])).toEqual([
      ['https://cdn.test/ads/tos-a-1080.mp4', 1920, 1080, 4500, 'video/mp4'],
      ['https://cdn.test/ads/tos-a-720.mp4', 1280, 720, 2000, 'video/mp4'],
    ]);
  });

  it('points impression, quartile, skip and error pixels to the collector', async () => {
    const [parsed] = await load(buildVast([ad('tos-a')]));
    expect((parsed?.ad.impressionURLTemplates as Array<{ url: string }>).map((t) => t.url)).toEqual(['https://px.test/p?ad=tos-a&e=impression']);
    expect(parsed?.ad.errorURLTemplates).toEqual(['https://px.test/p?ad=tos-a&e=error&code=[ERRORCODE]']);
    const tracking = parsed?.creative.trackingEvents ?? {};
    for (const event of ['start', 'firstQuartile', 'midpoint', 'thirdQuartile', 'complete', 'pause', 'resume', 'skip']) {
      expect(tracking[event]).toEqual([`https://px.test/p?ad=tos-a&e=${event}`]);
    }
  });

  it('writes a pod in sequence order when given several ads', async () => {
    const parsed = await load(buildVast([ad('tos-a'), ad('tos-b'), ad('tos-c')]));
    expect(parsed.map((p) => [p.ad.id, p.sequence])).toEqual([
      ['tos-a', 1],
      ['tos-b', 2],
      ['tos-c', 3],
    ]);
  });

  it('escapes the title and refuses bad input', () => {
    expect(buildVast([ad('tos-a', { title: 'Tom & Jerry <3' })])).toContain('<AdTitle>Tom &amp; Jerry &lt;3</AdTitle>');
    expect(() => buildVast([])).toThrow(RangeError);
    expect(() => buildVast([ad('bad id')])).toThrow(TypeError);
    expect(() => buildVast([ad('tos-a', { durationSeconds: 0 })])).toThrow(RangeError);
    expect(() => buildVast([ad('tos-a', { mediaFiles: [] })])).toThrow(RangeError);
    expect(() => buildVast([ad('tos-a', { pixelBaseUrl: 'px.test' })])).toThrow(TypeError);
  });
});
