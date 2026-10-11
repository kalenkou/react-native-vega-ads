import TestRenderer, { act } from 'react-test-renderer';
import { AccessibilityInfo } from 'react-native';
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
  const texts = (): string[] => renderer.root.findAll((n) => (n.type as unknown) === 'Text').map((n) => String(n.props.children));
  return { renderer, update, images, texts };
}

describe('PauseAd', () => {
  beforeEach(() => announce.mockClear());

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
    expect(view.images().map((i) => i.props.source.uri)).toEqual(['https://cdn.test/pause.png', 'https://cdn.test/qr.png']);
    expect(view.texts()).toContain('Scan to learn more');
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
