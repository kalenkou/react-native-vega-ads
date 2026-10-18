import { pickBreaks } from '../src/pickBreaks';
import { cue, shot, shotsEvery } from './helpers';

describe('pickBreaks', () => {
  it('returns no breaks when there are no segments', () => {
    expect(pickBreaks([])).toEqual([]);
  });

  it('uses shot boundaries when there are no black frames', () => {
    // 30-minute video with a cut every 50 s: cuts at 50, 100, 150, ...
    const breaks = pickBreaks(shotsEvery(50, 1800));
    // First cut at or after 120 s is 150; then one at or after 450, 750, ...
    expect(breaks).toEqual([150, 450, 750, 1050, 1350, 1650]);
  });

  it('prefers black frames to a nearby shot boundary', () => {
    const segments = [...shotsEvery(50, 1800), cue('BlackFrames', 170, 172)];
    const breaks = pickBreaks(segments);
    expect(breaks[0]).toBe(171);
  });

  it('does not wait for black frames that are far away', () => {
    const segments = [...shotsEvery(50, 1800), cue('BlackFrames', 400, 402)];
    // 400 s is more than the 60 s search window after the 150 s cut.
    expect(pickBreaks(segments)[0]).toBe(150);
  });

  it('keeps the minimum gap between breaks', () => {
    const segments = [
      ...shotsEvery(10, 3600),
      cue('BlackFrames', 130, 132),
      cue('BlackFrames', 200, 202),
      cue('BlackFrames', 480, 482),
    ];
    const breaks = pickBreaks(segments, { minGapSeconds: 300 });
    // 201 is too close to 131; the next search starts at 431 and finds black frames at 481.
    expect(breaks.slice(0, 2)).toEqual([131, 481]);
    for (let i = 1; i < breaks.length; i++) {
      expect(breaks[i]! - breaks[i - 1]!).toBeGreaterThanOrEqual(300);
    }
  });

  it('never places a break before firstBreakAfterSeconds', () => {
    const segments = [...shotsEvery(10, 1200), cue('BlackFrames', 30, 31)];
    const breaks = pickBreaks(segments, { firstBreakAfterSeconds: 200 });
    expect(breaks[0]).toBe(200);
  });

  it('honours maxBreaks', () => {
    expect(pickBreaks(shotsEvery(50, 3600), { maxBreaks: 2 })).toEqual([150, 450]);
    expect(pickBreaks(shotsEvery(50, 3600), { maxBreaks: 0 })).toEqual([]);
  });

  it('never places a break inside opening credits', () => {
    const segments = [...shotsEvery(20, 1200), cue('OpeningCredits', 0, 245), cue('BlackFrames', 200, 201)];
    // The black frame at 200 s is inside the credits; the first cut after 245 s is 260.
    expect(pickBreaks(segments)[0]).toBe(260);
  });

  it('never places a break inside or after the end credits', () => {
    const segments = [...shotsEvery(50, 1800), cue('EndCredits', 1000, 1740), cue('BlackFrames', 1300, 1301)];
    const breaks = pickBreaks(segments);
    expect(breaks).toEqual([150, 450, 750]);
  });

  it('skips colour bars, slates and studio logos', () => {
    const segments = [
      ...shotsEvery(50, 1200),
      cue('ColorBars', 140, 160),
      cue('Slate', 160, 205),
      cue('StudioLogo', 205, 251),
    ];
    expect(pickBreaks(segments)[0]).toBe(300);
  });

  it('keeps clear of the last avoidLastSeconds of the video', () => {
    const segments = shotsEvery(50, 600);
    expect(pickBreaks(segments, { avoidLastSeconds: 60 })).toEqual([150, 450]);
    expect(pickBreaks(segments, { avoidLastSeconds: 200 })).toEqual([150]);
  });

  it('uses durationSeconds when given instead of the last segment end', () => {
    const segments = shotsEvery(50, 600);
    // The segments end at 600 s, but the video lasts 480 s: 450 is within the last 60 s.
    expect(pickBreaks(segments, { durationSeconds: 480 })).toEqual([150]);
  });

  it('returns no breaks for a very short video', () => {
    expect(pickBreaks(shotsEvery(5, 90))).toEqual([]);
    expect(pickBreaks([shot(0, 179), shot(179, 180)])).toEqual([]);
  });

  it('handles overlapping cues: black frames inside credits do not count', () => {
    const segments = [
      shot(0, 600),
      cue('Content', 0, 600),
      cue('OpeningCredits', 100, 200),
      cue('BlackFrames', 150, 160),
      cue('BlackFrames', 180, 220),
    ];
    // 150-160 is inside the credits; 180-220 overlaps them, so its middle (200) is the edge: still inside.
    expect(pickBreaks(segments)).toEqual([]);
  });

  it('counts a shot cut that falls inside black frames as the black-frame break', () => {
    const segments = [shot(0, 300), shot(300, 900), cue('BlackFrames', 298, 302)];
    expect(pickBreaks(segments)).toEqual([300]);
  });

  it('ignores segments below minConfidence', () => {
    const segments = [shot(0, 200), shot(200, 900, 55), shot(900, 1200), cue('BlackFrames', 400, 402, 60)];
    expect(pickBreaks(segments, { minConfidence: 80 })).toEqual([900]);
    expect(pickBreaks(segments)).toEqual([200, 900]);
  });

  it('ignores segments without timestamps and the cut at time zero', () => {
    const segments = [{ Type: 'SHOT' }, { Type: 'TECHNICAL_CUE' }, shot(0, 600)];
    expect(pickBreaks(segments)).toEqual([]);
  });

  it('is deterministic and does not depend on input order', () => {
    const segments = [...shotsEvery(37, 3000), cue('BlackFrames', 777, 779), cue('BlackFrames', 1500, 1503)];
    const reversed = [...segments].reverse();
    expect(pickBreaks(reversed)).toEqual(pickBreaks(segments));
  });

  describe('with speech', () => {
    const at = (startSeconds: number, endSeconds: number) => ({
      startMs: startSeconds * 1000,
      endMs: endSeconds * 1000,
    });

    it('never places a break inside speech', () => {
      // The cut at 150 s is in the middle of a sentence; the next cut, 200 s, is clear.
      expect(pickBreaks(shotsEvery(50, 1800), { speech: [at(140, 160)] }).slice(0, 2)).toEqual([200, 500]);
    });

    it('keeps a second clear of speech on both sides', () => {
      const segments = shotsEvery(50, 1800);
      expect(pickBreaks(segments, { speech: [at(140, 149.1)] })[0]).toBe(200);
      expect(pickBreaks(segments, { speech: [at(150.9, 160)] })[0]).toBe(200);
      expect(pickBreaks(segments, { speech: [at(140, 148.9), at(151.1, 160)] })[0]).toBe(150);
    });

    it('drops black frames that have speech over them', () => {
      const segments = [...shotsEvery(50, 1800), cue('BlackFrames', 170, 172)];
      // Without speech the black frames at 171 s win; with a line over them the cut at 150 s stays.
      expect(pickBreaks(segments, { speech: [at(169, 174)] })[0]).toBe(150);
    });

    it('changes nothing when there is no speech', () => {
      expect(pickBreaks(shotsEvery(50, 1800), { speech: [] })).toEqual(pickBreaks(shotsEvery(50, 1800)));
    });
  });

  it('rejects invalid options', () => {
    expect(() => pickBreaks([], { minGapSeconds: -1 })).toThrow(RangeError);
    expect(() => pickBreaks([], { maxBreaks: 1.5 })).toThrow(RangeError);
  });
});
