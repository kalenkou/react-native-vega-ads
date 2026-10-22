import { LAYOUT_WIDTH, layoutScale, scaleStyles } from '../src/layout';

describe('layoutScale', () => {
  it('is 1 on the 1920-wide layout of React Native 0.72 on Vega', () => {
    expect(LAYOUT_WIDTH).toBe(1920);
    expect(layoutScale(1920)).toBe(1);
  });

  it('is 0.5 on the 960x540 dp canvas of React Native 0.83 on Vega', () => {
    expect(layoutScale(960)).toBe(0.5);
  });

  it('reads the window width when it is not given', () => {
    expect(layoutScale()).toBe(1);
  });

  it('is 1 when the window has no width yet', () => {
    expect(layoutScale(0)).toBe(1);
  });

  it('is 1 when the window size is not known', () => {
    const rn = require('react-native') as typeof import('react-native'); // eslint-disable-line @typescript-eslint/no-require-imports
    const spy = jest.spyOn(rn.Dimensions, 'get').mockReturnValue(undefined as never);
    try {
      expect(layoutScale()).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('scaleStyles', () => {
  const styles = {
    box: {
      position: 'absolute',
      left: 48,
      right: 64,
      top: 40,
      bottom: 140,
      width: 180,
      height: 180,
      maxWidth: 1400,
      minHeight: 20,
      padding: 14,
      paddingHorizontal: 12,
      paddingVertical: 6,
      margin: 2,
      marginTop: 8,
      marginBottom: 8,
      marginRight: 16,
      borderRadius: 12,
      borderWidth: 2,
      gap: 10,
    },
    text: { fontSize: 28, lineHeight: 36, color: '#fff' },
    other: { zIndex: 10, opacity: 0.6, flex: 1, aspectRatio: 1.5, left: '50%', top: 0 },
  } as const;

  it('halves every length at scale 0.5', () => {
    const scaled = scaleStyles(styles, 0.5);
    expect(scaled.box).toEqual({
      position: 'absolute',
      left: 24,
      right: 32,
      top: 20,
      bottom: 70,
      width: 90,
      height: 90,
      maxWidth: 700,
      minHeight: 10,
      padding: 7,
      paddingHorizontal: 6,
      paddingVertical: 3,
      margin: 1,
      marginTop: 4,
      marginBottom: 4,
      marginRight: 8,
      borderRadius: 6,
      borderWidth: 1,
      gap: 5,
    });
    expect(scaled.text).toEqual({ fontSize: 14, lineHeight: 18, color: '#fff' });
  });

  it('halves the lengths by side, corner, start and end, and the text and shadow lengths', () => {
    const scaled = scaleStyles(
      {
        card: {
          borderTopWidth: 4,
          borderBottomWidth: 2,
          borderLeftWidth: 6,
          borderRightWidth: 8,
          borderStartWidth: 10,
          borderEndWidth: 12,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 26,
          borderBottomLeftRadius: 28,
          borderBottomRightRadius: 30,
          borderTopStartRadius: 32,
          borderTopEndRadius: 34,
          borderBottomStartRadius: 36,
          borderBottomEndRadius: 38,
          start: 40,
          end: 42,
          marginStart: 44,
          marginEnd: 46,
          paddingStart: 48,
          paddingEnd: 50,
          rowGap: 52,
          columnGap: 54,
          flexBasis: 56,
          shadowRadius: 8,
          shadowOffset: { width: 2, height: 4 },
        },
        heading: { letterSpacing: 1.4, textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 } },
      },
      0.5,
    );
    expect(scaled.card).toEqual({
      borderTopWidth: 2,
      borderBottomWidth: 1,
      borderLeftWidth: 3,
      borderRightWidth: 4,
      borderStartWidth: 5,
      borderEndWidth: 6,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 13,
      borderBottomLeftRadius: 14,
      borderBottomRightRadius: 15,
      borderTopStartRadius: 16,
      borderTopEndRadius: 17,
      borderBottomStartRadius: 18,
      borderBottomEndRadius: 19,
      start: 20,
      end: 21,
      marginStart: 22,
      marginEnd: 23,
      paddingStart: 24,
      paddingEnd: 25,
      rowGap: 26,
      columnGap: 27,
      flexBasis: 28,
      shadowRadius: 4,
      shadowOffset: { width: 1, height: 2 },
    });
    expect(scaled.heading).toEqual({
      letterSpacing: 0.7,
      textShadowRadius: 3,
      textShadowOffset: { width: 0, height: 1 },
    });
  });

  it('halves translateX and translateY in a transform and keeps scale and rotate', () => {
    const scaled = scaleStyles(
      { moved: { transform: [{ translateX: 40 }, { translateY: -20 }, { scale: 1.2 }, { rotate: '10deg' }] } },
      0.5,
    );
    expect(scaled.moved).toEqual({
      transform: [{ translateX: 20 }, { translateY: -10 }, { scale: 1.2 }, { rotate: '10deg' }],
    });
  });

  it('keeps a shadow offset and a transform at scale 1 and leaves the input as it was', () => {
    const styles = { moved: { shadowOffset: { width: 2, height: 4 }, transform: [{ translateX: 40 }] } };
    const before = JSON.stringify(styles);
    expect(scaleStyles(styles, 1)).toEqual(styles);
    scaleStyles(styles, 0.5);
    expect(JSON.stringify(styles)).toBe(before);
  });

  it('keeps what is not a length: z-order, opacity, flex, ratios, percentages and zero', () => {
    expect(scaleStyles(styles, 0.5).other).toEqual(styles.other);
  });

  it('changes nothing at scale 1 and leaves the input as it was', () => {
    const before = JSON.stringify(styles);
    expect(scaleStyles(styles, 1)).toEqual(styles);
    scaleStyles(styles, 0.5);
    expect(JSON.stringify(styles)).toBe(before);
  });

  it('uses the window width when no scale is given', () => {
    expect(scaleStyles(styles)).toEqual(styles);
  });
});

/**
 * The built-in ad UI, imported again with a 960x540 dp window: React Native 0.83 on Vega.
 * The renderer comes from the same fresh imports, so it drives the same React.
 */
function onDpCanvas() {
  let loaded!: {
    create: typeof import('react-test-renderer').create;
    StyleSheet: typeof import('react-native').StyleSheet;
    AdOverlay: typeof import('../src/AdOverlay').AdOverlay;
    PauseAd: typeof import('../src/PauseAd').PauseAd;
    AdCountdown: typeof import('../src/AdCountdown').AdCountdown;
  };
  // The styles are made when a module loads: only a fresh require sees the 960-wide window.
  /* eslint-disable @typescript-eslint/no-require-imports */
  jest.isolateModules(() => {
    const rn = require('react-native') as typeof import('react-native');
    jest.spyOn(rn.Dimensions, 'get').mockReturnValue({ width: 960, height: 540 } as never);
    loaded = {
      create: (require('react-test-renderer') as typeof import('react-test-renderer')).create,
      StyleSheet: rn.StyleSheet,
      AdOverlay: (require('../src/AdOverlay') as typeof import('../src/AdOverlay')).AdOverlay,
      PauseAd: (require('../src/PauseAd') as typeof import('../src/PauseAd')).PauseAd,
      AdCountdown: (require('../src/AdCountdown') as typeof import('../src/AdCountdown')).AdCountdown,
    };
  });
  /* eslint-enable @typescript-eslint/no-require-imports */
  return loaded;
}

describe('built-in ad UI on the 960x540 dp canvas', () => {
  const ui = {
    visible: true,
    name: 'Kettlo',
    label: 'Ad 1 of 1 · 0:10',
    announcement: 'Ad 1 of 1',
    skipAnnouncement: '',
    why: '',
    caption: 'Kettlo: lasts a lifetime',
    skip: { visible: true, enabled: true, label: 'Skip Ad' },
  };

  it('draws the label, caption and Skip at half the 1920-layout size', () => {
    const { create, AdOverlay, StyleSheet } = onDpCanvas();
    const tree = create(<AdOverlay ui={ui as never} onSkip={jest.fn()} captions />);
    const style = (text: string) =>
      StyleSheet.flatten(tree.root.findAll((n) => n.props.children === text)[0]?.props.style);
    expect(style('Ad 1 of 1 · 0:10')).toMatchObject({ left: 24, top: 20, fontSize: 14 });
    expect(style('Kettlo: lasts a lifetime')).toMatchObject({ fontSize: 16, maxWidth: 700 });
    expect(style('Skip Ad')).toMatchObject({ fontSize: 14 });
  });

  it('draws the pause ad, its 600 px image and its QR code at half size', () => {
    const { create, PauseAd, StyleSheet } = onDpCanvas();
    const view = {
      imageUrl: 'https://cdn.test/pause.png',
      width: 1200,
      height: 1200,
      clickThroughUrl: null,
      qr: { scanUrl: 'https://brand.test/qr', imageUrl: 'https://cdn.test/qr.png' },
    };
    const tree = create(<PauseAd view={view} />);
    const images = tree.root.findAll((n) => (n.type as unknown) === 'Image');
    expect(StyleSheet.flatten(images[0]?.props.style)).toMatchObject({ width: 300, height: 300 });
    expect(StyleSheet.flatten(images[1]?.props.style)).toMatchObject({ width: 90, height: 90 });
    const label = tree.root.findAll((n) => n.props.children === 'Ad')[0];
    expect(StyleSheet.flatten(label?.props.style)).toMatchObject({ fontSize: 13 });
  });

  it('draws the mid-roll countdown at half size', () => {
    const { create, AdCountdown, StyleSheet } = onDpCanvas();
    const tree = create(<AdCountdown nextBreakIn={5} />);
    const text = tree.root.findAll((n) => (n.type as unknown) === 'Text')[0];
    expect(StyleSheet.flatten(text?.props.style)).toMatchObject({ fontSize: 12 });
  });
});
