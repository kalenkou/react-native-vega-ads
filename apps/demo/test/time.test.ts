import {formatTime, fraction} from '../src/time';

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
