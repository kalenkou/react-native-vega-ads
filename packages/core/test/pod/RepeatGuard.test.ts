import { RepeatGuard, RepeatMemory, REPEAT_WINDOW_MS } from '../../src/pod/RepeatGuard';
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

  it('lets a spare ad that will not play take no place from the ads that will', () => {
    const guard = new RepeatGuard(new FakeClock(0));
    const yoyo = ad('b1', { advertiser: { value: 'Yoyo' } });
    const spareZeta = ad('b2', { advertiser: { value: 'Zeta' } });
    const zeta = ad('c', { advertiser: { value: 'Zeta' } });
    // Source 1 plays b1 only (no sequence numbers: the rest is spare); source 2 plays c.
    const result = guard.filter([[yoyo, spareZeta], [zeta]]);
    expect(ids(result.responses)).toEqual([['b1'], ['c']]);
    expect(result.dropped.map((d) => [d.ad.ad.id, d.reason])).toEqual([['b2', 'advertiser']]);
  });

  it('keeps a spare that can still replace the ad that will play', () => {
    const guard = new RepeatGuard(new FakeClock(0));
    const result = guard.filter([[ad('b1'), ad('b2')], [ad('c')]]);
    expect(ids(result.responses)).toEqual([['b1', 'b2'], ['c']]);
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

  describe('with a memory, across titles and app launches', () => {
    /** Like AsyncStorage: one string under one key. */
    interface Store {
      value: string | null;
      writes: number;
      memory: RepeatMemory;
    }
    function storage(initial: string | null = null): Store {
      const store: Store = {
        value: initial,
        writes: 0,
        memory: {
          read: async () => store.value,
          write: async (value: string) => {
            store.writes += 1;
            store.value = value;
          },
        },
      };
      return store;
    }

    async function settle(): Promise<void> {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    }

    it('drops a creative the household saw in another title', async () => {
      const clock = new FakeClock(0);
      const store = storage();
      new RepeatGuard(clock, { memory: store.memory }).shown(ad('kettlo'));
      await settle();

      clock.advance(REPEAT_WINDOW_MS - 1);
      const next = new RepeatGuard(clock, { memory: store.memory });
      await next.ready();
      expect(ids(next.filter([[ad('kettlo'), ad('brewnord')]]).responses)).toEqual([['brewnord']]);
    });

    it('stores only creatives still inside the window, at most 500', async () => {
      const clock = new FakeClock(0);
      const store = storage();
      const guard = new RepeatGuard(clock, { memory: store.memory, withinMs: 1000 });
      await guard.ready();
      guard.shown(ad('old'));
      clock.advance(1000);
      for (let i = 0; i < 600; i++) guard.shown(ad(`n${i}`, { media: [`https://cdn.test/n${i}.mp4`] }));
      await settle();
      const saved = JSON.parse(store.value as string) as { v: number; seen: Record<string, number> };
      expect(saved.v).toBe(1);
      expect(Object.keys(saved.seen)).toHaveLength(500);
      expect(saved.seen['media:https://cdn.test/old.mp4']).toBeUndefined();
      expect(saved.seen['media:https://cdn.test/n599.mp4']).toBe(1000);
      expect(saved.seen['media:https://cdn.test/n99.mp4']).toBeUndefined();
    });

    it('forgets a creative once its window is over', async () => {
      const clock = new FakeClock(0);
      const store = storage();
      const guard = new RepeatGuard(clock, { memory: store.memory, withinMs: 1000 });
      guard.shown(ad('old'));
      clock.advance(1000);
      guard.shown(ad('new'));
      await settle();
      expect(Object.keys((JSON.parse(store.value as string) as { seen: object }).seen)).toEqual(['media:https://cdn.test/new.mp4']);
    });

    it('keeps a creative shown again among the newest, even when it was first seen long ago', async () => {
      const clock = new FakeClock(0);
      const store = storage();
      const guard = new RepeatGuard(clock, { memory: store.memory });
      guard.shown(ad('kettlo'));
      clock.advance(1);
      for (let i = 0; i < 500; i++) guard.shown(ad(`n${i}`));
      clock.advance(1);
      guard.shown(ad('kettlo'));
      await settle();
      const seen = (JSON.parse(store.value as string) as { seen: Record<string, number> }).seen;
      expect(seen['media:https://cdn.test/kettlo.mp4']).toBe(2);
      expect(seen['media:https://cdn.test/n0.mp4']).toBeUndefined();
    });

    it('keeps the later time when the memory and this player both saw a creative', async () => {
      const clock = new FakeClock(0);
      const store = storage(JSON.stringify({ v: 1, seen: { 'media:https://cdn.test/kettlo.mp4': 0 } }));
      clock.advance(5000);
      const guard = new RepeatGuard(clock, { memory: store.memory, withinMs: 6000 });
      guard.shown(ad('kettlo'));
      await guard.ready();
      clock.advance(2000);
      expect(guard.filter([[ad('kettlo')]]).dropped).toHaveLength(1);
    });

    it('plays every ad when the memory cannot be read or holds something else', async () => {
      for (const memory of [
        { read: () => Promise.reject(new Error('disk')), write: async () => undefined },
        { read: async () => 'not json', write: async () => undefined },
        { read: async () => JSON.stringify({ v: 2, seen: { 'media:https://cdn.test/kettlo.mp4': 0 } }), write: async () => undefined },
        { read: async () => JSON.stringify({ v: 1, seen: { 'media:https://cdn.test/kettlo.mp4': '0' } }), write: async () => undefined },
      ]) {
        const guard = new RepeatGuard(new FakeClock(1), { memory });
        await guard.ready();
        expect(guard.filter([[ad('kettlo')]]).dropped).toHaveLength(0);
      }
    });

    it('goes on when the memory cannot be written', async () => {
      const guard = new RepeatGuard(new FakeClock(0), { memory: { read: async () => null, write: () => Promise.reject(new Error('full')) } });
      guard.shown(ad('kettlo'));
      await settle();
      expect(guard.filter([[ad('kettlo')]]).dropped).toHaveLength(1);
    });

    it('is ready at once without a memory', async () => {
      await expect(new RepeatGuard(new FakeClock(0)).ready()).resolves.toBeUndefined();
    });
  });
});
