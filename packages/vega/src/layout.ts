import { Dimensions } from 'react-native';

/**
 * The built-in ad UI is drawn for a 1920-wide layout. React Native 0.72 on Vega lays out in
 * physical pixels (1920x1080). React Native 0.83 on Vega lays out in dp on a 960x540 canvas, so the
 * same numbers would draw twice as big there.
 */
export const LAYOUT_WIDTH = 1920;

/** The window width over 1920: 1 on React Native 0.72 on Vega, 0.5 on React Native 0.83. */
export function layoutScale(width: number = Dimensions.get('window').width): number {
  return width > 0 ? width / LAYOUT_WIDTH : 1;
}

const LENGTHS = new Set([
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingHorizontal',
  'paddingVertical',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginHorizontal',
  'marginVertical',
  'borderRadius',
  'borderWidth',
  'gap',
  'fontSize',
  'lineHeight',
]);

/**
 * Styles written for the 1920-wide layout, with every length multiplied by `scale`, so they look
 * the same on React Native 0.72 and 0.83. Percentages, z-order, opacity and flex stay as they are.
 */
export function scaleStyles<T extends Record<string, object>>(styles: T, scale: number = layoutScale()): T {
  const scaled: Record<string, object> = {};
  for (const [name, style] of Object.entries(styles)) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(style)) {
      out[key] = LENGTHS.has(key) && typeof value === 'number' ? value * scale : value;
    }
    scaled[name] = out;
  }
  return scaled as T;
}
