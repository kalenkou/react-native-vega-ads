import { adCountdownState, adUiState } from '../../src/ui/adUiState';
import type { SessionSnapshot } from '../../src/machine/AdBreakSession';

function snapshot(overrides: Partial<SessionSnapshot>): SessionSnapshot {
  return { state: 'playing', position: 1, total: 2, adTime: 3.2, adDuration: 15, canSkip: false, skipIn: null, adSurface: 'ad', ...overrides };
}

describe('adUiState (R26)', () => {
  describe('why line', () => {
    const why = (overrides: Partial<NonNullable<SessionSnapshot['why']>>) =>
      adUiState(snapshot({ why: { blockedAfterScene: [], sceneSignals: [], repeatsLeftOut: 0, quieter: false, ...overrides } })).why;

    it('is empty when nothing was changed for the viewer', () => {
      expect(why({})).toBe('');
      expect(adUiState(snapshot({})).why).toBe('');
    });

    it('names the advertiser left out after the scene, the repeats and the volume', () => {
      expect(why({ blockedAfterScene: ['Kettlo'], sceneSignals: ['weapons', 'injury'], repeatsLeftOut: 1, quieter: true })).toBe(
        'No Kettlo ad after a scene with weapons and injury · An ad you saw recently was left out · Volume matched to the movie',
      );
    });

    it('lists several advertisers, and counts the ads when one has no name', () => {
      expect(why({ blockedAfterScene: ['Kettlo', 'Voltaro', 'Kettlo'], sceneSignals: ['injury'] })).toBe('No Kettlo or Voltaro ad after a scene with injury');
      expect(why({ blockedAfterScene: ['Kettlo', null], sceneSignals: ['death', 'grief', 'violence'] })).toBe(
        '2 ads left out after a scene with death, grief and violence',
      );
      expect(why({ blockedAfterScene: [null] })).toBe('1 ad left out after this scene');
      expect(why({ repeatsLeftOut: 3 })).toBe('3 ads you saw recently were left out');
    });

    it('takes the app\'s own words', () => {
      const ui = adUiState(snapshot({ why: { blockedAfterScene: [], sceneSignals: [], repeatsLeftOut: 0, quieter: true } }), {
        whyQuieter: 'Leiser, wie der Film',
      });
      expect(ui.why).toBe('Leiser, wie der Film');
    });
  });

  it('shows the ad number and the time left, rounded up', () => {
    expect(adUiState(snapshot({}))).toMatchObject({ visible: true, label: 'Ad 1 of 2 · 0:12' });
  });

  it('leaves out "of N" for a single ad', () => {
    expect(adUiState(snapshot({ total: 1, adTime: 0, adDuration: 75 })).label).toBe('Ad · 1:15');
  });

  it('gives the parts of the label for an own overlay: the ad name and the time left', () => {
    expect(adUiState(snapshot({}))).toMatchObject({ name: 'Ad 1 of 2', timeLeft: '0:12' });
    expect(adUiState(snapshot({ total: 1, adDuration: 0 }))).toMatchObject({ name: 'Ad', timeLeft: '' });
    const german = adUiState(snapshot({}), { adOf: (n, total) => `Werbung ${n}/${total}` });
    expect(german).toMatchObject({ name: 'Werbung 1/2', timeLeft: '0:12', label: 'Werbung 1/2 · 0:12' });
  });

  it('shows only "Ad" while the duration is unknown', () => {
    expect(adUiState(snapshot({ total: 1, adDuration: 0 })).label).toBe('Ad');
  });

  it('hides the skip button for a non-skippable ad', () => {
    expect(adUiState(snapshot({ skipIn: null })).skip).toEqual({ visible: false, enabled: false, label: '' });
  });

  it('counts down to skip, then enables it', () => {
    expect(adUiState(snapshot({ skipIn: 2.1 })).skip).toEqual({ visible: true, enabled: false, label: 'Skip in 3' });
    expect(adUiState(snapshot({ skipIn: 0, canSkip: true })).skip).toEqual({ visible: true, enabled: true, label: 'Skip Ad' });
  });

  it('has a screen reader line for the moment Skip becomes possible', () => {
    expect(adUiState(snapshot({ skipIn: 0, canSkip: true })).skipAnnouncement).toBe('You can skip the ad now');
    expect(adUiState(snapshot({ skipIn: 2 })).skipAnnouncement).toBe('');
    expect(adUiState(snapshot({ skipIn: null })).skipAnnouncement).toBe('');
    expect(adUiState(snapshot({ skipIn: 0, canSkip: true }), { announceCanSkip: 'Możesz pominąć' }).skipAnnouncement).toBe('Możesz pominąć');
  });

  it('gives a screen reader announcement when an ad starts', () => {
    expect(adUiState(snapshot({ adTime: 0 })).announcement).toBe('Ad 1 of 2, 15 seconds');
    expect(adUiState(snapshot({ total: 1, adTime: 0, adDuration: 30, skipIn: 5 })).announcement).toBe('Ad, 30 seconds, you can skip in 5 seconds');
  });

  it('is hidden when no ad is playing', () => {
    for (const state of ['idle', 'loading', 'ready', 'empty', 'resuming', 'interrupted', 'finished'] as const) {
      expect(adUiState(snapshot({ state })).visible).toBe(false);
    }
  });

  it('lets the app replace every string', () => {
    const ui = adUiState(snapshot({ skipIn: 2 }), {
      ad: 'Reklama',
      adOf: (position, total) => `Reklama ${position} z ${total}`,
      skipIn: (seconds) => `Pomiń za ${seconds}`,
      skip: 'Pomiń',
      seconds: (n) => `${n} s`,
      announceSkipIn: (seconds) => `Pomiń za ${seconds}`,
    });
    expect(ui.label).toBe('Reklama 1 z 2 · 0:12');
    expect(ui.skip.label).toBe('Pomiń za 2');
    expect(ui.announcement).toBe('Reklama 1 z 2, 15 s, Pomiń za 2');
  });
});

describe('adCountdownState', () => {
  it('shows "Ad in N" before a break and announces the break once, at its start', () => {
    expect(adCountdownState(5)).toEqual({ visible: true, label: 'Ad in 5', announcement: 'Ad break in 5 seconds' });
    expect(adCountdownState(1).label).toBe('Ad in 1');
  });

  it('is hidden when no break is coming', () => {
    expect(adCountdownState(null)).toEqual({ visible: false, label: '', announcement: '' });
  });

  it('lets the app replace the strings', () => {
    const state = adCountdownState(3, { adIn: (n) => `Werbung in ${n}`, announceAdIn: (n) => `Werbepause in ${n} Sekunden` });
    expect(state).toEqual({ visible: true, label: 'Werbung in 3', announcement: 'Werbepause in 3 Sekunden' });
  });
});
