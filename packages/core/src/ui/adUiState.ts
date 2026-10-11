import type { SessionSnapshot } from '../machine/AdBreakSession';

export interface AdUiStrings {
  ad: string;
  adOf: (position: number, total: number) => string;
  skip: string;
  skipIn: (seconds: number) => string;
  seconds: (count: number) => string;
  announceSkipIn: (seconds: number) => string;
  /** Before a break: "Ad in 5". */
  adIn: (seconds: number) => string;
  announceAdIn: (seconds: number) => string;
  /** On a pause ad: how to close it. */
  pauseAdHint: string;
  /** Next to a pause ad's QR code. */
  scanQr: string;
  announcePauseAd: string;
}

export const defaultAdUiStrings: AdUiStrings = {
  ad: 'Ad',
  adOf: (position, total) => `Ad ${position} of ${total}`,
  skip: 'Skip Ad',
  skipIn: (seconds) => `Skip in ${seconds}`,
  seconds: (count) => `${count} seconds`,
  announceSkipIn: (seconds) => `you can skip in ${seconds} seconds`,
  adIn: (seconds) => `Ad in ${seconds}`,
  announceAdIn: (seconds) => `Ad break in ${seconds} seconds`,
  pauseAdHint: 'Back closes the ad',
  scanQr: 'Scan to learn more',
  announcePauseAd: 'Ad while paused. Press Back to close it.',
};

export interface AdUiState {
  visible: boolean;
  /** "Ad 1 of 2 · 0:12" */
  label: string;
  skip: { visible: boolean; enabled: boolean; label: string };
  /** Text for the screen reader (VoiceView) when the ad starts. */
  announcement: string;
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** What the ad overlay shows, from the session snapshot (R26). Strings are English by default. */
export function adUiState(snapshot: SessionSnapshot, strings: Partial<AdUiStrings> = {}): AdUiState {
  const s = { ...defaultAdUiStrings, ...strings };
  const visible = snapshot.state === 'playing';
  const name = snapshot.total > 1 ? s.adOf(snapshot.position, snapshot.total) : s.ad;
  const known = snapshot.adDuration > 0;
  const label = known ? `${name} · ${clock(snapshot.adDuration - snapshot.adTime)}` : name;

  const skippable = snapshot.skipIn !== null;
  const waitSeconds = Math.ceil(snapshot.skipIn ?? 0);
  const skip = !skippable
    ? { visible: false, enabled: false, label: '' }
    : snapshot.canSkip
      ? { visible: true, enabled: true, label: s.skip }
      : { visible: true, enabled: false, label: s.skipIn(waitSeconds) };

  const parts = [name];
  if (known) parts.push(s.seconds(Math.round(snapshot.adDuration)));
  if (skippable && !snapshot.canSkip) parts.push(s.announceSkipIn(waitSeconds));

  return { visible, label, skip, announcement: parts.join(', ') };
}

export interface AdCountdownState {
  visible: boolean;
  /** "Ad in 5" */
  label: string;
  /** Text for the screen reader (VoiceView) when the countdown starts. */
  announcement: string;
}

/** The warning before a mid-roll, from `AdTimeline.nextBreakIn`. */
export function adCountdownState(nextBreakIn: number | null, strings: Partial<AdUiStrings> = {}): AdCountdownState {
  if (nextBreakIn === null) {
    return { visible: false, label: '', announcement: '' };
  }
  const s = { ...defaultAdUiStrings, ...strings };
  return { visible: true, label: s.adIn(nextBreakIn), announcement: s.announceAdIn(nextBreakIn) };
}
