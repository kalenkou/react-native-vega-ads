import {formatTime, fraction, markFraction, timecode} from '../src/time';

describe('formatTime', () => {
  it('shows minutes and seconds, and hours when there are any', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(75.9)).toBe('1:15');
    expect(formatTime(3725)).toBe('1:02:05');
  });

  it('treats bad values as zero', () => {
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(-5)).toBe('0:00');
  });
});

describe('fraction', () => {
  it('places a time on the timeline between 0 and 1', () => {
    expect(fraction(30, 120)).toBe(0.25);
    expect(fraction(200, 120)).toBe(1);
    expect(fraction(10, 0)).toBe(0);
  });
});

describe('timecode', () => {
  it('writes hours, minutes, seconds and milliseconds only when there are any', () => {
    expect(timecode(139.917)).toBe('00:02:19.917');
    expect(timecode(734)).toBe('00:12:14');
    expect(timecode(734.166667)).toBe('00:12:14.167');
    expect(timecode(0)).toBe('00:00:00');
    expect(timecode(3725.5)).toBe('01:02:05.500');
  });
});

describe('markFraction', () => {
  it('puts start and end at the edges, times and percents in between', () => {
    expect(markFraction({kind: 'start'}, 734)).toBe(0);
    expect(markFraction({kind: 'end'}, 734)).toBe(1);
    expect(markFraction({kind: 'time', seconds: 367}, 734)).toBe(0.5);
    expect(markFraction({kind: 'percent', percent: 25}, 734)).toBe(0.25);
    expect(markFraction({kind: 'time', seconds: 900}, 734)).toBe(1);
  });
});
