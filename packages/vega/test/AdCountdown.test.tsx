import TestRenderer, { act } from 'react-test-renderer';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { AdCountdown } from '../src/AdCountdown';

const announce = AccessibilityInfo.announceForAccessibility as jest.Mock;

function render(nextBreakIn: number | null) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<AdCountdown nextBreakIn={nextBreakIn} />);
  });
  const update = (next: number | null): void => {
    act(() => {
      renderer.update(<AdCountdown nextBreakIn={next} />);
    });
  };
  const texts = (): string[] =>
    renderer.root.findAll((n) => (n.type as unknown) === 'Text').map((n) => String(n.props.children));
  return { renderer, update, texts };
}

describe('AdCountdown', () => {
  beforeEach(() => announce.mockClear());

  it('takes the app style for its text', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <AdCountdown nextBreakIn={5} styles={{ countdown: { fontFamily: 'Brand', color: 'gold' } }} />,
      );
    });
    const text = renderer.root.findAll((n) => (n.type as unknown) === 'Text')[0];
    expect(StyleSheet.flatten(text?.props.style)).toMatchObject({ fontFamily: 'Brand', color: 'gold', fontSize: 24 });
  });

  it('shows "Ad in N" and counts down', () => {
    const view = render(5);
    expect(view.texts()).toEqual(['Ad in 5']);
    view.update(4);
    expect(view.texts()).toEqual(['Ad in 4']);
  });

  it('draws nothing when no break is coming', () => {
    expect(render(null).renderer.toJSON()).toBeNull();
  });

  it('announces the coming break once for VoiceView, not every second', () => {
    const view = render(5);
    view.update(4);
    view.update(3);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Ad break in 5 seconds');
    view.update(null);
    view.update(5);
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('takes no D-pad focus: the viewer is still watching the movie', () => {
    const view = render(5);
    expect(view.renderer.root.findAll((n) => n.props.hasTVPreferredFocus === true)).toHaveLength(0);
  });
});
