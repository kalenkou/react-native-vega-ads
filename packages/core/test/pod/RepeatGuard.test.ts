import { RepeatGuard, REPEAT_WINDOW_MS } from '../../src/pod/RepeatGuard';
import type { LinearAd } from '../../src/vast';
import { FakeClock } from '../fakes/FakeClock';

interface AdSpec {
  media?: string[];
  uaid?: [string, string];
  advertiser?: { id?: string | null; value: string };
  sequence?: number | null;
}

function ad(id: string, spec: AdSpec = {}): LinearAd {
  const media = spec.media ?? [`https://cdn.test/${id}.mp4`];
  return {
    ad: {
      id,
      sequence: spec.sequence ?? null,
      title: id,
      errorURLTemplates: [],
      impressionURLTemplates: [],
      creatives: [],
      advertiser: spec.advertiser ? { id: spec.advertiser.id ?? null, value: spec.advertiser.value } : null,
    },
    creative: {
      type: 'linear',
      id,
      duration: 10,
      skipDelay: null,
      mediaFiles: media.map((fileURL) => ({
        fileURL,
        mimeType: 'video/mp4',
        codec: null,
        deliveryType: 'progressive',
        width: 1280,
        height: 720,
        bitrate: 2000,
        minBitrate: 0,
        maxBitrate: 0,
        apiFramework: null,
      })),
      trackingEvents: {},
      universalAdIds: spec.uaid ? [{ idRegistry: spec.uaid[0], value: spec.uaid[1] }] : [],
    },
    sequence: spec.sequence ?? null,
    skipAfter: null,
    client: {} as LinearAd['client'],
  };
}

const ids = (responses: LinearAd[][]): string[][] => responses.map((ads) => ads.map((a) => a.ad.id as string));

describe('RepeatGuard', () => {
  it('drops a creative shown in an earlier break, and allows it again after the window', () => {
    const clock = new FakeClock(0);
    const guard = new RepeatGuard(clock);
    guard.shown(ad('kettlo'));

    clock.advance(REPEAT_WINDOW_MS - 1);
    const soon = guard.filter([[ad('brewnord', { sequence: 1 }), ad('kettlo', { sequence: 2 })]]);
    expect(ids(soon.responses)).toEqual([['brewnord']]);
    expect(soon.dropped.map((d) => [d.ad.ad.id, d.reason])).toEqual([['kettlo', 'repeat']]);

    clock.advance(1);
    expect(ids(guard.filter([[ad('kettlo')]]).responses)).toEqual([['kettlo']]);
  });

  it('takes the window from the options', () => {
    const clock = new FakeClock(0);
    const guard = new RepeatGuard(clock, { withinMs: 60_000 });
    guard.shown(ad('kettlo'));
    clock.advance(59_999);
    expect(guard.filter([[ad('kettlo')]]).dropped).toHaveLength(1);
    clock.advance(1);
    expect(guard.filter([[ad('kettlo')]]).dropped).toHaveLength(0);
  });

  it('knows one creative by its Universal Ad ID even when it comes with other media URLs', () => {
    const guard = new RepeatGuard(new FakeClock(0));
    guard.shown(ad('a', { uaid: ['ad-id.org', 'CNPA0484000H'], media: ['https://one.test/a.mp4'] }));
    const result = guard.filter([[ad('b', { uaid: ['ad-id.org', 'CNPA0484000H'], media: ['https://two.test/b.mp4'] })]]);
    expect(result.dropped.map((d) => d.ad.ad.id)).toEqual(['b']);
  });

  it('does not match on an "unknown" Universal Ad ID', () => {
    const guard = new RepeatGuard(new FakeClock(0));
    guard.shown(ad('a', { uaid: ['unknown', 'unknown'] }));
    expect(guard.filter([[ad('b', { uaid: ['unknown', 'unknown'] })]]).dropped).toHaveLength(0);
  });

  it('knows one creative by any of its media file URLs', () => {
    const guard = new RepeatGuard(new FakeClock(0));
    guard.shown(ad('a', { media: ['https://cdn.test/k_1080p.mp4', 'https://cdn.test/k_720p.mp4'] }));
    expect(guard.filter([[ad('b', { media: ['https://cdn.test/k_720p.mp4'] })]]).dropped).toHaveLength(1);
  });

  it('never drops an ad it cannot identify', () => {
    const guard = new RepeatGuard(new FakeClock(0));
    guard.shown(ad('a', { media: [] }));
    expect(ids(guard.filter([[ad('b', { media: [] }), ad('c', { media: [] })]]).responses)).toEqual([['b', 'c']]);
  });

  it('keeps one copy of a creative in a break: the first one to play', () => {
    const guard = new RepeatGuard(new FakeClock(0));
    const result = guard.filter([
      [ad('second', { sequence: 2, media: ['https://cdn.test/k.mp4'] }), ad('first', { sequence: 1, media: ['https://cdn.test/k.mp4'] })],
      [ad('other-source', { media: ['https://cdn.test/k.mp4'] })],
    ]);
    expect(ids(result.responses)).toEqual([['first'], []]);
    expect(result.dropped.map((d) => [d.ad.ad.id, d.reason])).toEqual([
      ['second', 'repeat'],
      ['other-source', 'repeat'],
    ]);
  });

  it('keeps one ad per advertiser in a break, by advertiser id or by name', () => {
    const guard = new RepeatGuard(new FakeClock(0));
    const result = guard.filter([
      [
        ad('tea-1', { sequence: 1, advertiser: { value: 'Leafline Tea' } }),
        ad('car', { sequence: 2, advertiser: { value: 'Voltaro' } }),
        ad('tea-2', { sequence: 3, advertiser: { value: ' leafline tea ' } }),
        ad('car-2', { sequence: 4, advertiser: { id: 'adv-9', value: 'Voltaro Motors' } }),
        ad('car-3', { sequence: 5, advertiser: { id: 'adv-9', value: 'Voltaro EU' } }),
      ],
    ]);
    expect(ids(result.responses)).toEqual([['tea-1', 'car', 'car-2']]);
    expect(result.dropped.map((d) => [d.ad.ad.id, d.reason])).toEqual([
      ['tea-2', 'advertiser'],
      ['car-3', 'advertiser'],
    ]);
  });

  it('lets an advertiser come back in the next break', () => {
    const guard = new RepeatGuard(new FakeClock(0));
    guard.shown(ad('tea-1', { advertiser: { value: 'Leafline Tea' } }));
    expect(guard.filter([[ad('tea-2', { advertiser: { value: 'Leafline Tea' } })]]).dropped).toHaveLength(0);
  });
});
