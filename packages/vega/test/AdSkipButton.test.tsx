import TestRenderer, { act, ReactTestInstance } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import type { AdUiState } from 'react-native-ads-core';
import { AdSkipButton } from '../src/AdSkipButton';

function ui(skip: AdUiState['skip']): AdUiState {
  return {
    visible: true,
    label: 'Ad 1 of 3 · 0:12',
    name: 'Ad 1 of 3',
    timeLeft: '0:12',
    skip,
    announcement: 'Ad 1 of 3, 12 seconds',
    skipAnnouncement: '',
    why: '',
    caption: '',
  };
}

const hidden = { visible: false, enabled: false, label: '' };
const waiting = { visible: true, enabled: false, label: 'Skip in 3' };
const ready = { visible: true, enabled: true, label: 'Skip Ad' };

function render(element: JSX.Element) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  const host = (testID: string): ReactTestInstance | undefined =>
    renderer.root.findAll((n) => n.props.testID === testID && typeof (n.type as unknown) === 'string')[0];
  const text = (): ReactTestInstance | undefined => renderer.root.findAll((n) => (n.type as unknown) === 'Text')[0];
  return { renderer, host, text };
}

describe('AdSkipButton', () => {
  it('renders nothing outside an ad', () => {
    const { renderer } = render(<AdSkipButton ui={{ ...ui(ready), visible: false }} onSkip={jest.fn()} />);
    expect(renderer.toJSON()).toBeNull();
  });

  it('holds the D-pad focus during a non-skippable ad, so an own overlay needs nothing else', () => {
    const { host } = render(<AdSkipButton ui={ui(hidden)} onSkip={jest.fn()} />);
    expect(host('vega-ads-skip')).toBeUndefined();
    expect(host('vega-ads-focus')?.props.hasTVPreferredFocus).toBe(true);
    expect(host('vega-ads-focus')?.props.accessibilityLabel).toBe('Ad 1 of 3 · 0:12');
  });

  it('shows the countdown disabled, then skips with focus once allowed', () => {
    const onSkip = jest.fn();
    const first = render(<AdSkipButton ui={ui(waiting)} onSkip={onSkip} />);
    expect(first.host('vega-ads-skip')?.props.accessibilityState).toEqual({ disabled: true });
    act(() => first.host('vega-ads-skip')?.props.onPress());
    expect(onSkip).not.toHaveBeenCalled();

    const second = render(<AdSkipButton ui={ui(ready)} onSkip={onSkip} />);
    expect(second.host('vega-ads-skip')?.props.hasTVPreferredFocus).toBe(true);
    act(() => second.host('vega-ads-skip')?.props.onPress());
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('takes the app styles for the button and its text, with extra styles while waiting', () => {
    const styles = {
      skip: { backgroundColor: 'teal', right: 96 },
      skipWaiting: { opacity: 0.3 },
      skipText: { color: 'black', fontFamily: 'Brand' },
      skipWaitingText: { color: 'gray' },
    };
    const waitingView = render(<AdSkipButton ui={ui(waiting)} onSkip={jest.fn()} styles={styles} />);
    expect(StyleSheet.flatten(waitingView.host('vega-ads-skip')?.props.style)).toMatchObject({ backgroundColor: 'teal', right: 96, opacity: 0.3 });
    expect(StyleSheet.flatten(waitingView.text()?.props.style)).toMatchObject({ color: 'gray', fontFamily: 'Brand' });

    const readyView = render(<AdSkipButton ui={ui(ready)} onSkip={jest.fn()} styles={styles} />);
    expect(StyleSheet.flatten(readyView.host('vega-ads-skip')?.props.style)).not.toHaveProperty('opacity', 0.3);
    expect(StyleSheet.flatten(readyView.text()?.props.style)).toMatchObject({ color: 'black', fontFamily: 'Brand' });
  });
});
