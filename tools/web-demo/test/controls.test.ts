import type { AdUiState } from 'react-native-ads-core';
import { AdAnnouncer, backAction, contentTakesOver, keyAction, playAction } from '../src/controls';

describe('keyAction', () => {
  it('loads the tag on Enter in the URL field and leaves the other keys to typing', () => {
    expect(keyAction('Enter', 'input')).toBe('load');
    expect(keyAction(' ', 'input')).toBeNull();
    expect(keyAction('ArrowLeft', 'input')).toBeNull();
    expect(keyAction('Backspace', 'input')).toBeNull();
    expect(keyAction('Escape', 'input')).toBeNull();
  });

  it('controls the player from the page', () => {
    expect(keyAction(' ', 'page')).toBe('toggle');
    expect(keyAction('Escape', 'page')).toBe('back');
    expect(keyAction('Backspace', 'page')).toBe('back');
    expect(keyAction('ArrowRight', 'page')).toBe('forward');
    expect(keyAction('ArrowLeft', 'page')).toBe('rewind');
    expect(keyAction('Enter', 'page')).toBeNull();
    expect(keyAction('a', 'page')).toBeNull();
  });

  it('still seeks and goes back when a button has the focus, and lets Space press that button', () => {
    expect(keyAction('ArrowRight', 'button')).toBe('forward');
    expect(keyAction('ArrowLeft', 'button')).toBe('rewind');
    expect(keyAction('Escape', 'button')).toBe('back');
    expect(keyAction(' ', 'button')).toBeNull();
  });

  it('leaves Space and the arrows to a list, which uses them to choose', () => {
    expect(keyAction(' ', 'select')).toBeNull();
    expect(keyAction('ArrowRight', 'select')).toBeNull();
    expect(keyAction('ArrowLeft', 'select')).toBeNull();
    expect(keyAction('Escape', 'select')).toBe('back');
  });
});

describe('playAction', () => {
  const state = {
    ended: false,
    viewing: true,
    adOnScreen: false,
    contentBegun: true,
    contentPaused: false,
  };

  it('starts a viewing, and a new one after the end', () => {
    expect(playAction({ ...state, viewing: false })).toBe('start');
    expect(playAction({ ...state, ended: true })).toBe('restart');
    expect(playAction({ ...state, ended: true, viewing: false })).toBe('restart');
  });

  it('pauses and plays the ad on screen', () => {
    expect(playAction({ ...state, adOnScreen: true })).toBe('toggleAd');
    expect(playAction({ ...state, adOnScreen: true, contentBegun: false })).toBe('toggleAd');
  });

  it('pauses and plays the movie', () => {
    expect(playAction(state)).toBe('pauseContent');
    expect(playAction({ ...state, contentPaused: true })).toBe('playContent');
  });

  it('waits while the pre-roll loads: the movie must not start before it', () => {
    expect(playAction({ ...state, contentBegun: false, contentPaused: true })).toBe('wait');
  });
});

describe('contentTakesOver', () => {
  it('is true when the ads before the movie are over, however they ended', () => {
    expect(contentTakesOver('breakEnd')).toBe(true);
    expect(contentTakesOver('error:start')).toBe(true);
    expect(contentTakesOver('break:preroll:empty')).toBe(true);
    expect(contentTakesOver('break:preroll:interrupted')).toBe(true);
    expect(contentTakesOver('break:midroll-1:superseded')).toBe(true);
    expect(contentTakesOver('break:midroll-1:late')).toBe(true);
  });

  it('is false while an ad break goes on', () => {
    expect(contentTakesOver('breakStart')).toBe(false);
    expect(contentTakesOver('impression')).toBe(false);
    expect(contentTakesOver('start')).toBe(false);
    expect(contentTakesOver('complete')).toBe(false);
    expect(contentTakesOver('skipped:repeat')).toBe(false);
    expect(contentTakesOver('content:ended')).toBe(false);
  });
});

describe('backAction', () => {
  it('closes a pause ad first', () => {
    expect(backAction({ viewing: true, pauseAdOnScreen: true })).toBe('closePauseAd');
  });

  it('closes the player otherwise, also during an ad: Back never skips an ad, as on the TV', () => {
    expect(backAction({ viewing: true, pauseAdOnScreen: false })).toBe('closePlayer');
  });

  it('does nothing on the movie page', () => {
    expect(backAction({ viewing: false, pauseAdOnScreen: false })).toBeNull();
  });
});

function ui(part: Partial<AdUiState>): AdUiState {
  return {
    visible: true,
    label: 'Ad 1 of 2 · 0:10',
    name: 'Ad 1 of 2',
    timeLeft: '0:10',
    skip: { visible: false, enabled: false, label: '', accessibilityLabel: '' },
    announcement: 'Ad 1 of 2, 10 seconds',
    skipAnnouncement: '',
    why: '',
    caption: '',
    ...part,
  };
}

const waiting = (seconds: number) => ({
  skip: { visible: true, enabled: false, label: `Skip in ${seconds}`, accessibilityLabel: 'Skip Ad' },
  announcement: `Ad 1 of 2, 10 seconds, you can skip in ${seconds} seconds`,
});
const canSkip = {
  skip: { visible: true, enabled: true, label: 'Skip Ad', accessibilityLabel: 'Skip Ad' },
  skipAnnouncement: 'You can skip the ad now',
};

describe('AdAnnouncer', () => {
  it('says each ad once, not again on every second of its countdown', () => {
    const announcer = new AdAnnouncer();
    expect(announcer.next(ui(waiting(5)))).toBe('Ad 1 of 2, 10 seconds, you can skip in 5 seconds');
    expect(announcer.next(ui(waiting(4)))).toBeNull();
    expect(announcer.next(ui(waiting(3)))).toBeNull();
  });

  it('says once that Skip is possible, after the countdown', () => {
    const announcer = new AdAnnouncer();
    announcer.next(ui(waiting(1)));
    expect(announcer.next(ui(canSkip))).toBe('You can skip the ad now');
    expect(announcer.next(ui(canSkip))).toBeNull();
  });

  it('names an ad that can be skipped at once, and does not call Skip news then', () => {
    const announcer = new AdAnnouncer();
    expect(announcer.next(ui({ ...canSkip, announcement: 'Ad 1 of 2, 10 seconds' }))).toBe('Ad 1 of 2, 10 seconds');
    expect(announcer.next(ui(canSkip))).toBeNull();
  });

  it('says the next ad of the pod, and the same name again in a later break', () => {
    const announcer = new AdAnnouncer();
    announcer.next(ui({}));
    expect(announcer.next(ui({ name: 'Ad 2 of 2', announcement: 'Ad 2 of 2, 15 seconds' }))).toBe(
      'Ad 2 of 2, 15 seconds',
    );
    expect(announcer.next(ui({ visible: false }))).toBeNull();
    expect(announcer.next(ui({}))).toBe('Ad 1 of 2, 10 seconds');
  });

  it('says a single ad again in the next break, though its name is the same "Ad"', () => {
    const announcer = new AdAnnouncer();
    expect(announcer.next(ui({ name: 'Ad', announcement: 'Ad, 10 seconds' }))).toBe('Ad, 10 seconds');
    expect(announcer.next(ui({ visible: false }))).toBeNull();
    expect(announcer.next(ui({ name: 'Ad', announcement: 'Ad, 20 seconds' }))).toBe('Ad, 20 seconds');
  });

  it('forgets a countdown when the ad changes before Skip', () => {
    const announcer = new AdAnnouncer();
    announcer.next(ui(waiting(3)));
    expect(announcer.next(ui({ name: 'Ad 2 of 2', announcement: 'Ad 2 of 2, 15 seconds', ...canSkip }))).toBe(
      'Ad 2 of 2, 15 seconds',
    );
    expect(announcer.next(ui({ name: 'Ad 2 of 2', ...canSkip }))).toBeNull();
  });
});
