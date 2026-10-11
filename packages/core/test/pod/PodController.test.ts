import { PodController, PodItem } from '../../src/pod/PodController';
import type { LinearAd } from '../../src/vast';

function ad(id: string, sequence: number | null = null, duration = 10): LinearAd {
  return {
    ad: { id, sequence, title: id, errorURLTemplates: [], impressionURLTemplates: [], creatives: [] },
    creative: { type: 'linear', id, duration, skipDelay: null, mediaFiles: [], trackingEvents: {} },
    sequence,
    skipAfter: null,
    client: {} as LinearAd['client'],
  };
}

const ids = (items: Array<PodItem | null>): Array<string | null> => items.map((item) => item?.ad.ad.id ?? null);

function drain(pod: PodController, elapsedMs = 0): Array<PodItem | null> {
  const items: Array<PodItem | null> = [];
  for (let item = pod.next(elapsedMs); item; item = pod.next(elapsedMs)) {
    items.push(item);
  }
  return items;
}

describe('PodController (R17)', () => {
  it('plays a single stand-alone ad as 1 of 1', () => {
    const pod = new PodController([[ad('a')]]);
    expect(pod.total).toBe(1);
    const first = pod.next();
    expect(first).toMatchObject({ position: 1, total: 1 });
    expect(first?.ad.ad.id).toBe('a');
    expect(pod.next()).toBeNull();
  });

  it('plays only the first ad of a response without sequence numbers; the rest is buffet', () => {
    const pod = new PodController([[ad('a'), ad('b'), ad('c')]]);
    expect(pod.total).toBe(1);
    expect(ids(drain(pod))).toEqual(['a']);
  });

  it('plays an optimized pod in sequence order and keeps buffet ads in reserve', () => {
    const pod = new PodController([[ad('second', 2), ad('first', 1), ad('spare')]]);
    expect(pod.total).toBe(2);
    expect(drain(pod).map((item) => [item?.ad.ad.id, item?.position])).toEqual([
      ['first', 1],
      ['second', 2],
    ]);
  });

  it('replaces a failed pod ad with a buffet ad at the same position', () => {
    const pod = new PodController([[ad('p1', 1), ad('p2', 2), ad('spare')]]);
    expect(pod.next()?.ad.ad.id).toBe('p1');
    pod.fail();
    const replacement = pod.next();
    expect(replacement?.ad.ad.id).toBe('spare');
    expect(replacement?.position).toBe(1);
    expect(pod.next()?.ad.ad.id).toBe('p2');
  });

  it('moves on when a failed ad has no replacement left', () => {
    const pod = new PodController([[ad('p1', 1), ad('p2', 2)]]);
    pod.next();
    pod.fail();
    expect(pod.next()).toMatchObject({ position: 2 });
    pod.fail();
    expect(pod.next()).toBeNull();
  });

  it('joins several ad responses of a standard pod in source order', () => {
    const pod = new PodController([[ad('a')], [ad('b')], [ad('c')]]);
    expect(pod.total).toBe(3);
    expect(drain(pod).map((item) => [item?.ad.ad.id, item?.position, item?.total])).toEqual([
      ['a', 1, 3],
      ['b', 2, 3],
      ['c', 3, 3],
    ]);
  });

  it('uses buffet only from the response the failed ad came from', () => {
    const pod = new PodController([[ad('a'), ad('a-spare')], [ad('b')]]);
    pod.next();
    expect(pod.next()?.ad.ad.id).toBe('b');
    pod.fail();
    expect(pod.next()).toBeNull();
  });

  it('mixes a pod response and a single-ad response', () => {
    const pod = new PodController([[ad('p2', 2), ad('p1', 1)], [ad('x')]]);
    expect(ids(drain(pod))).toEqual(['p1', 'p2', 'x']);
  });

  it('does not start an ad that would end after the break budget (R10)', () => {
    const pod = new PodController([[ad('a', 1, 10), ad('b', 2, 10), ad('c', 3, 10)]], { budgetMs: 25_000 });
    expect(pod.next(0)?.ad.ad.id).toBe('a');
    expect(pod.next(10_000)?.ad.ad.id).toBe('b');
    expect(pod.next(20_000)).toBeNull();
  });

  it('skips an ad that does not fit but tries a shorter one after it', () => {
    const pod = new PodController([[ad('a', 1, 10), ad('long', 2, 30), ad('short', 3, 5)]], { budgetMs: 20_000 });
    expect(pod.next(0)?.ad.ad.id).toBe('a');
    expect(pod.next(10_000)?.ad.ad.id).toBe('short');
  });

  it('allows ads with unknown duration within the budget', () => {
    const pod = new PodController([[ad('unknown', null, -1)]], { budgetMs: 5_000 });
    expect(pod.next(0)?.ad.ad.id).toBe('unknown');
  });

  it('is empty without ads', () => {
    const pod = new PodController([[], []]);
    expect(pod.total).toBe(0);
    expect(pod.next()).toBeNull();
  });

  it('peeks at the next ad without moving on', () => {
    const pod = new PodController([[ad('p1', 1), ad('p2', 2)]]);
    pod.next();
    expect(pod.peek()?.ad.ad.id).toBe('p2');
    expect(pod.peek()?.position).toBe(2);
    expect(pod.next()?.ad.ad.id).toBe('p2');
    expect(pod.peek()).toBeNull();
  });

  it('peeks at the buffet replacement after a failure, without using it up', () => {
    const pod = new PodController([[ad('p1', 1), ad('p2', 2), ad('spare')]]);
    pod.next();
    pod.fail();
    expect(pod.peek()?.ad.ad.id).toBe('spare');
    expect(pod.next()?.ad.ad.id).toBe('spare');
  });

  it('applies the budget when peeking', () => {
    const pod = new PodController([[ad('a', 1, 10), ad('b', 2, 10)]], { budgetMs: 15_000 });
    pod.next(0);
    expect(pod.peek(10_000)).toBeNull();
  });

  it('ignores fail() when nothing is playing', () => {
    const pod = new PodController([[ad('a')]]);
    pod.fail();
    expect(pod.next()?.ad.ad.id).toBe('a');
  });
});
