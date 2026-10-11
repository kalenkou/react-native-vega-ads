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
