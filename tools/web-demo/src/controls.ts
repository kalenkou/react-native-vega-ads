import type { AdUiState } from 'react-native-ads-core';

/** What a key does on the page. */
export type KeyAction = 'load' | 'toggle' | 'back' | 'forward' | 'rewind' | null;

/** Where the key was pressed: the tag's URL field, a button, a list or the rest of the page. */
export type KeyTarget = 'input' | 'button' | 'select' | 'page';

/**
 * The keys of the page: Space plays and pauses, Escape and Backspace are Back, the arrows seek
 * 10 seconds. A focused button keeps Space (the browser presses it) and a list keeps Space and
 * the arrows (they choose an option). In the URL field only Enter counts: it loads the tag.
 */
export function keyAction(key: string, target: KeyTarget): KeyAction {
  if (target === 'input') {
    return key === 'Enter' ? 'load' : null;
  }
  if (key === 'Escape' || key === 'Backspace') {
    return 'back';
  }
  if (key === ' ') {
    return target === 'page' ? 'toggle' : null;
  }
  if (target === 'select') {
    return null;
  }
  return key === 'ArrowRight' ? 'forward' : key === 'ArrowLeft' ? 'rewind' : null;
}

export interface PlayState {
  /** The movie and its post-roll are over. */
  ended: boolean;
  /** A viewing has started (an AdManager runs). */
  viewing: boolean;
  /** An ad is on screen. */
  adOnScreen: boolean;
  /**
   * The movie has played in this viewing, or the library has handed over to it (see
   * contentTakesOver). Until then the pre-roll is still loading.
   */
  contentBegun: boolean;
  contentPaused: boolean;
}

/**
 * An onEvent name after which the movie is the viewer's to play: the break is over, empty, cut
 * off or late, or the start failed. Play must work then even when the browser refused to start
 * the movie without a click.
 */
export function contentTakesOver(eventName: string): boolean {
  return (
    eventName === 'breakEnd' ||
    eventName === 'error:start' ||
    /^break:.+:(empty|interrupted|superseded|late)$/.test(eventName)
  );
}

export type BackAction = 'closePauseAd' | 'closePlayer' | null;

/**
 * Back, as on the TV: a pause ad closes first. Otherwise the player closes, also during an ad
 * (VegaAdsPlayer's default `backDuringAd: 'app'`), so Back never skips an ad.
 */
export function backAction(state: { viewing: boolean; pauseAdOnScreen: boolean }): BackAction {
  if (!state.viewing) {
    return null;
  }
  return state.pauseAdOnScreen ? 'closePauseAd' : 'closePlayer';
}

export type PlayAction = 'restart' | 'start' | 'toggleAd' | 'wait' | 'playContent' | 'pauseContent';

/** What Play (the button or Space) does now. */
export function playAction(state: PlayState): PlayAction {
  if (state.ended) {
    return 'restart';
  }
  if (!state.viewing) {
    return 'start';
  }
  if (state.adOnScreen) {
    return 'toggleAd';
  }
  if (!state.contentBegun) {
    return 'wait'; // the pre-roll is loading: the movie starts after it
  }
  return state.contentPaused ? 'playContent' : 'pauseContent';
}

/**
 * The lines for a screen reader during ads, as useAdAnnouncements says them to VoiceView on the
 * TV: each ad once when it starts, and "You can skip the ad now" once after its Skip countdown.
 */
export class AdAnnouncer {
  private announced: string | null = null;
  /** This ad has shown a Skip countdown, so "you can skip now" is news. */
  private skipWaited = false;

  /** The line to say for this state of the ad overlay, or null. */
  next(ui: AdUiState): string | null {
    if (!ui.visible) {
      this.announced = null;
      this.skipWaited = false;
      return null;
    }
    let line: string | null = null;
    if (this.announced !== ui.name) {
      this.announced = ui.name;
      this.skipWaited = false;
      line = ui.announcement;
    }
    if (ui.skip.visible && !ui.skip.enabled) {
      this.skipWaited = true;
    } else if (this.skipWaited && ui.skipAnnouncement) {
      this.skipWaited = false;
      line = ui.skipAnnouncement;
    }
    return line;
  }
}
