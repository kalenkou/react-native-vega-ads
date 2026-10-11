import { BreakScheduler, Decision } from '../../src/schedule/BreakScheduler';
import type { BreakOffset } from '@vega-ads/vast';

const at = (seconds: number): BreakOffset => ({ kind: 'time', seconds });
const start: BreakOffset = { kind: 'start' };
const end: BreakOffset = { kind: 'end' };
const pct = (percent: number): BreakOffset => ({ kind: 'percent', percent });

function play(scheduler: BreakScheduler, from: number, to: number, step = 0.5): Decision[] {
  const decisions: Decision[] = [];
  for (let t = from; t <= to + 1e-9; t += step) {
    decisions.push(...scheduler.onTime(Number(t.toFixed(3))));
  }
  return decisions;
}

describe('BreakScheduler (R10, R24)', () => {
  it('starts the pre-roll at once, with its prefetch first', () => {
    const scheduler = new BreakScheduler([{ id: 'pre', offset: start }, { id: 'mid', offset: at(60) }]);
    expect(scheduler.begin()).toEqual([
      { type: 'prefetch', breakId: 'pre' },
      { type: 'start', breakId: 'pre' },
    ]);
    expect(scheduler.begin()).toEqual([]);
  });

  it('tells whether a break is used up', () => {
    const scheduler = new BreakScheduler([{ id: 'a', offset: at(30) }, { id: 'b', offset: at(200) }]);
    scheduler.begin();
    scheduler.onTime(20);
    expect(scheduler.isDone('a')).toBe(false);
    scheduler.onTime(250); // seek over both: only b plays (R24)
    expect(scheduler.isDone('a')).toBe(true);
    expect(scheduler.isDone('b')).toBe(true);
    expect(scheduler.isDone('unknown')).toBe(true);
  });

  it('resumes at a content time: earlier breaks count as played, no pre-roll, no snap-back', () => {
    const scheduler = new BreakScheduler([
      { id: 'pre', offset: start },
      { id: 'a', offset: at(30) },
      { id: 'b', offset: at(200) },
    ]);
    scheduler.resumeAt(120);
    expect(scheduler.begin()).toEqual([]);
    expect(scheduler.isDone('pre')).toBe(true);
    expect(scheduler.isDone('a')).toBe(true);
    expect(scheduler.onTime(121)).toEqual([]);
    expect(play(scheduler, 185, 200)).toEqual([
      { type: 'prefetch', breakId: 'b' },
      { type: 'start', breakId: 'b' },
    ]);
  });

  it('a percent break before the resume point counts as played once the duration is known', () => {
    const scheduler = new BreakScheduler([{ id: 'p', offset: pct(10) }]);
    scheduler.resumeAt(120);
    scheduler.setDuration(600); // 10% = 60 s, behind the viewer
    expect(scheduler.isDone('p')).toBe(true);
  });

  it('forget() lets a prefetched, unplayed break be prefetched again', () => {
    const scheduler = new BreakScheduler([{ id: 'a', offset: at(30) }]);
    scheduler.begin();
    expect(scheduler.onTime(20)).toEqual([{ type: 'prefetch', breakId: 'a' }]);
    expect(scheduler.onTime(21)).toEqual([]);
    scheduler.forget('a');
    expect(scheduler.onTime(22)).toEqual([{ type: 'prefetch', breakId: 'a' }]);
  });

  it('does nothing at begin without a pre-roll', () => {
    expect(new BreakScheduler([{ id: 'mid', offset: at(60) }]).begin()).toEqual([]);
  });

  it('prefetches a mid-roll 15 s early and starts it on time, once each', () => {
    const scheduler = new BreakScheduler([{ id: 'mid', offset: at(60) }]);
    scheduler.begin();
    expect(play(scheduler, 0, 44.5)).toEqual([]);
    expect(play(scheduler, 45, 59.5)).toEqual([{ type: 'prefetch', breakId: 'mid' }]);
    expect(play(scheduler, 60, 80)).toEqual([{ type: 'start', breakId: 'mid' }]);
  });

  it('uses a custom prefetch lead time', () => {
    const scheduler = new BreakScheduler([{ id: 'mid', offset: at(60) }], { prefetchSeconds: 5 });
    expect(play(scheduler, 0, 54.5)).toEqual([]);
    expect(scheduler.onTime(55)).toEqual([{ type: 'prefetch', breakId: 'mid' }]);
  });

  it('prefetches an early mid-roll on the first time update', () => {
    const scheduler = new BreakScheduler([{ id: 'mid', offset: at(10) }]);
    expect(scheduler.onTime(0)).toEqual([{ type: 'prefetch', breakId: 'mid' }]);
  });

  it('plays breaks in time order', () => {
    const scheduler = new BreakScheduler([
      { id: 'b', offset: at(120) },
      { id: 'a', offset: at(60) },
    ]);
    const starts = play(scheduler, 0, 130).filter((d) => d.type === 'start');
    expect(starts).toEqual([
      { type: 'start', breakId: 'a' },
      { type: 'start', breakId: 'b' },
    ]);
  });

  it('places percent breaks once the duration is known', () => {
    const scheduler = new BreakScheduler([{ id: 'half', offset: pct(50) }]);
    expect(play(scheduler, 0, 120)).toEqual([]);
    // 50% of 200 s is 100 s, which is already behind the viewer at 120 s.
    scheduler.setDuration(200);
    expect(play(scheduler, 120.5, 130)).toEqual([]);
    const fresh = new BreakScheduler([{ id: 'half', offset: pct(50) }]);
    fresh.setDuration(200);
    expect(play(fresh, 84, 100)).toEqual([
      { type: 'prefetch', breakId: 'half' },
      { type: 'start', breakId: 'half' },
    ]);
  });

  it('prefetches the post-roll before the end and starts it when content ends', () => {
    const scheduler = new BreakScheduler([{ id: 'post', offset: end }]);
    scheduler.setDuration(100);
    expect(play(scheduler, 0, 84.5)).toEqual([]);
    expect(play(scheduler, 85, 100)).toEqual([{ type: 'prefetch', breakId: 'post' }]);
    expect(scheduler.onEnded()).toEqual([{ type: 'start', breakId: 'post' }]);
    expect(scheduler.onEnded()).toEqual([]);
  });

  it('prefetches the post-roll on end when the duration was never known', () => {
    const scheduler = new BreakScheduler([{ id: 'post', offset: end }]);
    expect(scheduler.onEnded()).toEqual([
      { type: 'prefetch', breakId: 'post' },
      { type: 'start', breakId: 'post' },
    ]);
  });

  it('after a seek forward over mid-rolls, plays only the last one skipped (snap-back)', () => {
    const scheduler = new BreakScheduler([
      { id: 'm30', offset: at(30) },
      { id: 'm60', offset: at(60) },
      { id: 'm120', offset: at(120) },
    ]);
    play(scheduler, 0, 10);
    expect(scheduler.onTime(90)).toEqual([
      { type: 'prefetch', breakId: 'm60' },
      { type: 'start', breakId: 'm60' },
    ]);
    expect(play(scheduler, 90.5, 104.5)).toEqual([]);
    expect(play(scheduler, 105, 125).map((d) => d.breakId)).toEqual(['m120', 'm120']);
  });

  it('does not repeat a played break after seeking back over it', () => {
    const scheduler = new BreakScheduler([{ id: 'm30', offset: at(30) }]);
    play(scheduler, 0, 31);
    expect(scheduler.onTime(5)).toEqual([]);
    expect(play(scheduler, 5.5, 40)).toEqual([]);
  });

  it('treats a small jump as normal playback, not a seek', () => {
    const scheduler = new BreakScheduler([{ id: 'm30', offset: at(30) }]);
    play(scheduler, 0, 29);
    expect(scheduler.onTime(31)).toEqual([{ type: 'start', breakId: 'm30' }]);
  });

  it('starts a mid-roll that a seek lands exactly on', () => {
    const scheduler = new BreakScheduler([{ id: 'm60', offset: at(60) }]);
    scheduler.onTime(0);
    expect(scheduler.onTime(60)).toEqual([
      { type: 'prefetch', breakId: 'm60' },
      { type: 'start', breakId: 'm60' },
    ]);
  });

  it('plays one break, not two, when a seek over a mid-roll lands exactly on the next (C2-7)', () => {
    const scheduler = new BreakScheduler([
      { id: 'm30', offset: at(30) },
      { id: 'm60', offset: at(60) },
    ]);
    play(scheduler, 0, 10);
    expect(scheduler.onTime(60)).toEqual([
      { type: 'prefetch', breakId: 'm60' },
      { type: 'start', breakId: 'm60' },
    ]);
    expect(play(scheduler, 60.5, 70)).toEqual([]);
  });

  it('can skip a break on request, for example when its request failed', () => {
    const scheduler = new BreakScheduler([{ id: 'm60', offset: at(60) }]);
    play(scheduler, 0, 50);
    scheduler.skip('m60');
    expect(play(scheduler, 50.5, 70)).toEqual([]);
  });

  it('ignores breaks after the end of content', () => {
    const scheduler = new BreakScheduler([{ id: 'late', offset: at(500) }]);
    scheduler.setDuration(100);
    expect(play(scheduler, 0, 100)).toEqual([]);
    expect(scheduler.onEnded()).toEqual([]);
  });
});
