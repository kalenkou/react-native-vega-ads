import type { BreakWhy, SessionSnapshot } from '../machine/AdBreakSession';
import type { AdPlan } from '../manager/adPlan';
import type { WatchReport } from '../manager/watchReport';

export interface AdUiStrings {
  ad: string;
  adOf: (position: number, total: number) => string;
  skip: string;
  skipIn: (seconds: number) => string;
  seconds: (count: number) => string;
  announceSkipIn: (seconds: number) => string;
  /** Said once when Skip becomes possible during an ad. */
  announceCanSkip: string;
  /** Before a break: "Ad in 5". */
  adIn: (seconds: number) => string;
  announceAdIn: (seconds: number) => string;
  /** On a pause ad: how to close it. */
  pauseAdHint: string;
  /** Next to a pause ad's QR code. */
  scanQr: string;
  announcePauseAd: string;
  /** Ads left out because of the scene before the break: their advertisers (null: no name) and what the scene shows. */
  whyLeftOut: (advertisers: ReadonlyArray<string | null>, sceneSignals: readonly string[]) => string;
  /** Ads left out because the viewer saw them recently. */
  whyRepeats: (count: number) => string;
  /** The ad plays quieter, to match the content. */
  whyQuieter: string;
  /** Before Play, on the title's page: how many breaks, and the first one when it is known. */
  adPlan: (plan: AdPlan) => string;
  /** After a watch: how many ads played and what the viewer was spared. */
  watchReport: (report: WatchReport) => string;
}

function plural(count: number, one: string): string {
  return `${count} ${one}${count === 1 ? '' : 's'}`;
}

function adPlan({ breaks, preroll }: AdPlan): string {
  if (breaks === 0) {
    return 'No ads';
  }
  if (!preroll) {
    return plural(breaks, 'ad break');
  }
  const skip = preroll.skipAfter === null ? '' : `, skippable after ${preroll.skipAfter} s`;
  return `${plural(breaks, 'ad break')} · first: ${plural(preroll.ads, 'ad')}, ${preroll.seconds} s${skip}`;
}

function watchReport(r: WatchReport): string {
  const parts = [plural(r.ads, 'ad')];
  if (r.repeatsLeftOut > 0) parts.push(`${plural(r.repeatsLeftOut, 'repeat')} left out`);
  if (r.sameAdvertiserLeftOut > 0) parts.push(`${plural(r.sameAdvertiserLeftOut, 'ad')} of the same brand left out`);
  if (r.blockedAfterScene > 0) parts.push(`${plural(r.blockedAfterScene, 'ad')} left out after a scene`);
  if (r.quieter > 0) parts.push(`${plural(r.quieter, 'ad')} turned down, up to ${Math.round(r.mostTurnedDownDb)} dB`);
  if (parts.length === 1) parts.push('none left out or turned down');
  if (r.skipped > 0) parts.push(`${r.skipped} skipped`);
  return parts.join(' · ');
}

/** "a", "a and b", "a, b and c". */
function andList(items: readonly string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function whyLeftOut(advertisers: ReadonlyArray<string | null>, sceneSignals: readonly string[]): string {
  const scene = sceneSignals.length > 0 ? `a scene with ${andList(sceneSignals)}` : 'this scene';
  const names = [...new Set(advertisers)];
  if (names.every((name) => name !== null)) {
    return `No ${names.join(' or ')} ad after ${scene}`;
  }
  return `${advertisers.length} ${advertisers.length === 1 ? 'ad' : 'ads'} left out after ${scene}`;
}

export const defaultAdUiStrings: AdUiStrings = {
  ad: 'Ad',
  adOf: (position, total) => `Ad ${position} of ${total}`,
  skip: 'Skip Ad',
  skipIn: (seconds) => `Skip in ${seconds}`,
  seconds: (count) => `${count} seconds`,
  announceSkipIn: (seconds) => `you can skip in ${seconds} seconds`,
  announceCanSkip: 'You can skip the ad now',
  adIn: (seconds) => `Ad in ${seconds}`,
  announceAdIn: (seconds) => `Ad break in ${seconds} seconds`,
  pauseAdHint: 'Back closes the ad',
  scanQr: 'Scan to learn more',
  announcePauseAd: 'Ad while paused. Press Back to close it.',
  whyLeftOut,
  whyRepeats: (count) =>
    count === 1 ? 'An ad you saw recently was left out' : `${count} ads you saw recently were left out`,
  whyQuieter: 'Volume matched to the movie',
  adPlan,
  watchReport,
};

export interface AdUiState {
  visible: boolean;
  /** "Ad 1 of 2 · 0:12" */
  label: string;
  /** The ad part of the label, "Ad 1 of 2", for an own overlay that lays the parts out itself. */
  name: string;
  /** The time part of the label, "0:12"; empty while the ad's duration is unknown. */
  timeLeft: string;
  skip: { visible: boolean; enabled: boolean; label: string };
  /** Text for the screen reader (VoiceView) when the ad starts. */
  announcement: string;
  /** Text for the screen reader while Skip is possible; empty otherwise. */
  skipAnnouncement: string;
  /** Why the break looks as it does: "No Kettlo ad after a scene with injury · Volume matched to the movie". Empty when nothing changed. */
  why: string;
  /** The ad's closed caption to show now; empty when there is none or no ad plays. */
  caption: string;
}

function whyLine(why: BreakWhy | undefined, s: AdUiStrings): string {
  if (!why) {
    return '';
  }
  const parts: string[] = [];
  if (why.blockedAfterScene.length > 0) parts.push(s.whyLeftOut(why.blockedAfterScene, why.sceneSignals));
  if (why.repeatsLeftOut > 0) parts.push(s.whyRepeats(why.repeatsLeftOut));
  if (why.quieter) parts.push(s.whyQuieter);
  return parts.join(' · ');
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
  const timeLeft = known ? clock(snapshot.adDuration - snapshot.adTime) : '';
  const label = known ? `${name} · ${timeLeft}` : name;

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

  const skipAnnouncement = skippable && snapshot.canSkip ? s.announceCanSkip : '';
  return {
    visible,
    label,
    name,
    timeLeft,
    skip,
    announcement: parts.join(', '),
    skipAnnouncement,
    why: whyLine(snapshot.why, s),
    caption: visible ? snapshot.caption : '',
  };
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
