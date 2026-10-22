import {StyleSheet} from 'react-native';
import {scaleStyles} from 'react-native-vega-ads';

/** "Timecode" look: a dark edit-suite screen, timecodes in mono, ad breaks in orange. */
export const colors = {
  background: '#0b0e14',
  panel: '#121722',
  scrim: 'rgba(11,14,20,0.9)',
  line: '#2a3242',
  border: '#4a5468',
  text: '#eef1f6',
  muted: '#aeb6c4',
  /** Focus and the played part of the timeline. */
  accent: '#6fb6ff',
  /** Ad breaks: marks on the timelines and the ad label. */
  adBreak: '#ff9a4d',
  track: '#2a3242',
  focus: '#6fb6ff',
};

/** Font files in assets/fonts, named after their family (IBM Plex, SIL Open Font License 1.1). */
export const fonts = {
  display: 'IBM Plex Sans Condensed Bold',
  body: 'IBM Plex Sans',
  bodyStrong: 'IBM Plex Sans SemiBold',
  mono: 'IBM Plex Mono',
  monoStrong: 'IBM Plex Mono SemiBold',
};

/**
 * StyleSheet.create for the demo's styles, written for the 1920x1080 layout of React Native 0.72
 * on Vega. React Native 0.83 lays out in dp on a 960x540 canvas: the lengths are halved there,
 * so the screens look the same on both.
 */
export const layoutStyles = <T extends StyleSheet.NamedStyles<T>>(
  styles: T,
): T => StyleSheet.create(scaleStyles(styles));
