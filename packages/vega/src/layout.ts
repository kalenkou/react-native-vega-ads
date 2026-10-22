import { Dimensions } from 'react-native';

/**
 * The built-in ad UI is drawn for a 1920-wide layout. React Native 0.72 on Vega lays out in
 * physical pixels (1920x1080). React Native 0.83 on Vega lays out in dp on a 960x540 canvas, so the
 * same numbers would draw twice as big there.
 */
export const LAYOUT_WIDTH = 1920;

/**
 * The window width over 1920: 1 on React Native 0.72 on Vega, 0.5 on React Native 0.83. 1 when the
 * width is not known. The built-in ad UI reads it once, when the package loads.
 */
export function layoutScale(width: number = Dimensions.get('window')?.width ?? 0): number {
  return width > 0 ? width / LAYOUT_WIDTH : 1;
}

const LENGTHS = new Set([
  'top',
  'right',
  'bottom',
  'left',
  'start',
  'end',
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'flexBasis',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingStart',
  'paddingEnd',
  'paddingHorizontal',
  'paddingVertical',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginStart',
  'marginEnd',
  'marginHorizontal',
  'marginVertical',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'borderTopStartRadius',
  'borderTopEndRadius',
  'borderBottomStartRadius',
  'borderBottomEndRadius',
  'borderWidth',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStartWidth',
  'borderEndWidth',
  'gap',
  'rowGap',
  'columnGap',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'shadowRadius',
  'textShadowRadius',
]);

/** `shadowOffset` and `textShadowOffset`: `{ width, height }` in the same units. */
const OFFSETS = new Set(['shadowOffset', 'textShadowOffset']);

/** The transform parts that are lengths. `scale` and `rotate` stay as they are. */
const TRANSLATIONS = new Set(['translateX', 'translateY']);

function scaleValue(key: string, value: unknown, scale: number): unknown {
  if (typeof value === 'number') {
    return LENGTHS.has(key) ? value * scale : value;
  }
  if (OFFSETS.has(key) && isRecord(value)) {
    return mapRecord(value, (part) => (typeof part === 'number' ? part * scale : part));
  }
  if (key === 'transform' && Array.isArray(value)) {
    return value.map((step: unknown) =>
      isRecord(step)
        ? mapRecord(step, (part, name) => (TRANSLATIONS.has(name) && typeof part === 'number' ? part * scale : part))
        : step,
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function mapRecord(
  record: Record<string, unknown>,
  map: (value: unknown, key: string) => unknown,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = map(value, key);
  }
  return out;
}

/**
 * Styles written for the 1920-wide layout, with every length multiplied by `scale`, so they look
 * the same on React Native 0.72 and 0.83. Lengths are positions, sizes, padding, margin, borders,
 * gaps, font size, line height, letter spacing, shadow radius and offset, and `translateX` and
 * `translateY`. Percentages, z-order, opacity, flex and `scale` or `rotate` transforms stay as they
 * are.
 */
export function scaleStyles<T extends Record<string, object>>(styles: T, scale: number = layoutScale()): T {
  const scaled: Record<string, object> = {};
  for (const [name, style] of Object.entries(styles)) {
    scaled[name] = mapRecord(style as Record<string, unknown>, (value, key) => scaleValue(key, value, scale));
  }
  return scaled as T;
}
