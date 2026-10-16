/** 75 → "1:15", 3725 → "1:02:05". */
export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Where `seconds` is on a timeline of `duration`, from 0 to 1. */
export function fraction(seconds: number, duration: number): number {
  if (!(duration > 0)) {
    return 0;
  }
  return Math.min(1, Math.max(0, seconds / duration));
}

/** 139.917 → "00:02:19.917", 734 → "00:12:14": the VMAP time format, milliseconds only when set. */
export function timecode(seconds: number): string {
  const ms = Math.round(Math.max(0, seconds) * 1000);
  const two = (n: number) => String(n).padStart(2, '0');
  const whole = Math.floor(ms / 1000);
  const rest = ms % 1000;
  const base = `${two(Math.floor(whole / 3600))}:${two(
    Math.floor((whole % 3600) / 60),
  )}:${two(whole % 60)}`;
  return rest > 0 ? `${base}.${String(rest).padStart(3, '0')}` : base;
}

/** Where a VMAP break offset is on a timeline of `duration` seconds, from 0 to 1. */
export function markFraction(
  at:
    | {kind: 'start'}
    | {kind: 'end'}
    | {kind: 'time'; seconds: number}
    | {kind: 'percent'; percent: number},
  duration: number,
): number {
  switch (at.kind) {
    case 'start':
      return 0;
    case 'end':
      return 1;
    case 'percent':
      return Math.min(1, Math.max(0, at.percent / 100));
    default:
      return fraction(at.seconds, duration);
  }
}
