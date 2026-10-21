import TestRenderer, { act } from 'react-test-renderer';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import type { PauseAdView } from 'react-native-ads-core';
import { PauseAd } from '../src/PauseAd';

const announce = AccessibilityInfo.announceForAccessibility as jest.Mock;

const VIEW: PauseAdView = {
  imageUrl: 'https://cdn.test/pause.png',
  width: 600,
  height: 600,
  clickThroughUrl: null,
  qr: { scanUrl: 'https://brand.test/qr', imageUrl: 'https://cdn.test/qr.png' },
};

function render(view: PauseAdView | null) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<PauseAd view={view} />);
  });
  const update = (next: PauseAdView | null): void => {
    act(() => {
      renderer.update(<PauseAd view={next} />);
    });
  };
  const images = () => renderer.root.findAll((n) => (n.type as unknown) === 'Image');
  const texts = (): string[] =>
    renderer.root.findAll((n) => (n.type as unknown) === 'Text').map((n) => String(n.props.children));
  return { renderer, update, images, texts };
}

describe('PauseAd', () => {
  beforeEach(() => announce.mockClear());

  it('takes the app styles for the "Ad" label and the hints', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <PauseAd view={VIEW} styles={{ pauseAdLabel: { fontFamily: 'Brand' }, pauseAdHint: { color: 'gold' } }} />,
      );
    });
    const texts = renderer.root.findAll((n) => (n.type as unknown) === 'Text');
    const byText = (content: string) => texts.find((n) => n.props.children === content);
    expect(StyleSheet.flatten(byText('Ad')?.props.style)).toMatchObject({ fontFamily: 'Brand', fontSize: 26 });
    expect(StyleSheet.flatten(byText('Scan to learn more')?.props.style)).toMatchObject({ color: 'gold' });
    expect(StyleSheet.flatten(byText('Back closes the ad')?.props.style)).toMatchObject({
      color: 'gold',
      fontSize: 26,
    });
  });

  it('draws nothing without a pause ad', () => {
    expect(render(null).renderer.toJSON()).toBeNull();
  });

  it('shows the image at its size, marked as an ad, with how to close it', () => {
    const view = render({ ...VIEW, qr: null });
    const [image] = view.images();
    expect(image?.props.source).toEqual({ uri: 'https://cdn.test/pause.png' });
    expect(image?.props.style).toMatchObject({ width: 600, height: 600 });
    expect(view.texts()).toEqual(['Ad', 'Back closes the ad']);
  });

  it('shows the QR code from the ad server, with a hint', () => {
    const view = render(VIEW);
    expect(view.images().map((i) => i.props.source.uri)).toEqual([
      'https://cdn.test/pause.png',
      'https://cdn.test/qr.png',
    ]);
    expect(view.texts()).toContain('Scan to learn more');
  });

  it('puts the QR code beside the image, so the card is no taller than the image', () => {
    const view = render(VIEW);
    const row = view.renderer.root.findAll(
      (n) => (n.type as unknown) === 'View' && StyleSheet.flatten(n.props.style)?.flexDirection === 'row-reverse',
    );
    expect(row).toHaveLength(1);
    expect(row[0]?.findAll((n) => (n.type as unknown) === 'Image')).toHaveLength(2);
  });

  it('keeps the QR code readable on a bright picture: a white tile with a quiet zone around it', () => {
    const view = render(VIEW);
    const qr = view.images().find((i) => i.props.source.uri === 'https://cdn.test/qr.png');
    const tile = StyleSheet.flatten(qr?.parent?.props.style) ?? {};
    expect(tile.backgroundColor).toBe('#fff');
    expect(tile.padding).toBeGreaterThanOrEqual(12);
  });

  it('wraps a long scan hint to the width of the QR tile, so the card does not grow sideways', () => {
    const view = render(VIEW);
    const qr = view.images().find((i) => i.props.source.uri === 'https://cdn.test/qr.png');
    const tile = StyleSheet.flatten(qr?.parent?.props.style) ?? {};
    const tileWidth = Number(qr?.props.style.width) + 2 * Number(tile.padding);
    const hint = view.renderer.root.find(
      (n) => (n.type as unknown) === 'Text' && n.props.children === 'Scan to learn more',
    );
    expect(StyleSheet.flatten(hint.props.style).maxWidth).toBe(tileWidth);
  });

  it('puts the hints on a dark backing, so they read on a bright picture', () => {
    const view = render(VIEW);
    for (const hint of ['Scan to learn more', 'Back closes the ad']) {
      const text = view.renderer.root.find((n) => (n.type as unknown) === 'Text' && n.props.children === hint);
      expect(StyleSheet.flatten(text.props.style).backgroundColor).toBe('rgba(0,0,0,0.6)');
    }
  });

  it('scales a large image down to fit the side of the screen, keeping its shape', () => {
    const view = render({ ...VIEW, width: 1200, height: 900, qr: null });
    expect(view.images()[0]?.props.style).toMatchObject({ width: 800, height: 600 });
  });

  it('announces the pause ad once for VoiceView', () => {
    const view = render(VIEW);
    view.update({ ...VIEW });
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Ad while paused. Press Back to close it.');
    view.update(null);
    view.update(VIEW);
    expect(announce).toHaveBeenCalledTimes(2);
  });
});
