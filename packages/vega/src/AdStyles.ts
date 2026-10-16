import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

/**
 * Styles for the parts of the built-in ad UI, added on top of its defaults: your fonts, colours
 * and positions without drawing an own overlay. Each component reads the keys it draws.
 */
export interface AdStyles {
  /** The ad label, "Ad 1 of 3 · 0:12" (`AdOverlay`). */
  label?: StyleProp<TextStyle>;
  /** The line under the label, why the break looks as it does (`AdOverlay` with `showWhy`). */
  why?: StyleProp<TextStyle>;
  /** The Skip button (`AdOverlay`, `AdSkipButton`). */
  skip?: StyleProp<ViewStyle>;
  /** Added to `skip` while the viewer still has to wait ("Skip in 3"). */
  skipWaiting?: StyleProp<ViewStyle>;
  /** The Skip button's text. */
  skipText?: StyleProp<TextStyle>;
  /** Added to `skipText` while the viewer still has to wait. */
  skipWaitingText?: StyleProp<TextStyle>;
  /** "Ad in 5" before a mid-roll (`AdCountdown`). */
  countdown?: StyleProp<TextStyle>;
  /** The "Ad" label over a pause ad (`PauseAd`). */
  pauseAdLabel?: StyleProp<TextStyle>;
  /** The hints of a pause ad: how to close it, and the QR code's caption (`PauseAd`). */
  pauseAdHint?: StyleProp<TextStyle>;
}
