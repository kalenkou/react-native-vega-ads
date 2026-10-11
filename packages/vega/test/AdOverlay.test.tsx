import TestRenderer, { act, ReactTestInstance } from 'react-test-renderer';
import { AccessibilityInfo } from 'react-native';
import type { AdUiState } from 'react-native-ads-core';
import { AdOverlay } from '../src/AdOverlay';

const announce = AccessibilityInfo.announceForAccessibility as jest.Mock;

function ui(overrides: Partial<AdUiState> = {}): AdUiState {
  return {
    visible: true,
    label: 'Ad 1 of 3 · 0:12',
    skip: { visible: false, enabled: false, label: '' },
    announcement: 'Ad 1 of 3, 12 seconds',
    skipAnnouncement: '',
    ...overrides,
  };
}

function render(state: AdUiState, onSkip = jest.fn()) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<AdOverlay ui={state} onSkip={onSkip} />);
  });
  const update = (next: AdUiState): void => {
    act(() => {
      renderer.update(<AdOverlay ui={next} onSkip={onSkip} />);
    });
  };
  const skipButton = (): ReactTestInstance | undefined => renderer.root.findAll((n) => n.props.testID === 'vega-ads-skip' && typeof (n.type as unknown) === 'string')[0];
  const texts = (): string[] => renderer.root.findAll((n) => (n.type as unknown) === 'Text').map((n) => String(n.props.children));
  return { renderer, update, skipButton, texts, onSkip };
}

beforeEach(() => announce.mockClear());

describe('AdOverlay', () => {
  it('renders nothing outside an ad', () => {
    const { renderer } = render(ui({ visible: false }));
    expect(renderer.toJSON()).toBeNull();
  });

  it('shows the ad label', () => {
    const { texts } = render(ui());
    expect(texts()).toContain('Ad 1 of 3 · 0:12');
  });

  it('has no Skip button for a non-skippable ad', () => {
    const { skipButton } = render(ui());
    expect(skipButton()).toBeUndefined();
  });

  it('holds the D-pad focus during a non-skippable ad, so the app behind does not react', () => {
    const { renderer } = render(ui());
    const anchor = renderer.root.findAll((n) => n.props.testID === 'vega-ads-focus' && typeof (n.type as unknown) === 'string')[0];
    expect(anchor?.props.hasTVPreferredFocus).toBe(true);
    expect(anchor?.props.accessibilityLabel).toBe('Ad 1 of 3 · 0:12');
  });

  it('shows a disabled Skip countdown that ignores presses', () => {
    const { skipButton, texts, onSkip } = render(ui({ skip: { visible: true, enabled: false, label: 'Skip in 3' } }));
    expect(texts()).toContain('Skip in 3');
    expect(skipButton()?.props.accessibilityState).toEqual({ disabled: true });
    act(() => skipButton()?.props.onPress());
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('takes D-pad focus and skips when Skip is allowed', () => {
    const { skipButton, onSkip } = render(ui({ skip: { visible: true, enabled: true, label: 'Skip Ad' } }));
    const button = skipButton();
    expect(button?.props.hasTVPreferredFocus).toBe(true);
    expect(button?.props.accessibilityRole).toBe('button');
    act(() => button?.props.onPress());
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('announces each ad once for the screen reader (R26)', () => {
    const { update } = render(ui({ label: 'Ad 1 of 2 · 0:15', announcement: 'Ad 1 of 2, 15 seconds' }));
    expect(announce).toHaveBeenCalledWith('Ad 1 of 2, 15 seconds');

    update(ui({ label: 'Ad 1 of 2 · 0:14', announcement: 'Ad 1 of 2, 15 seconds' }));
    expect(announce).toHaveBeenCalledTimes(1);

    update(ui({ label: 'Ad 2 of 2 · 0:10', announcement: 'Ad 2 of 2, 10 seconds' }));
    expect(announce).toHaveBeenLastCalledWith('Ad 2 of 2, 10 seconds');
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('does not announce again while the Skip countdown changes the text', () => {
    const skip = { visible: true, enabled: false, label: 'Skip in 5' };
    const { update } = render(ui({ label: 'Ad · 0:15', announcement: 'Ad, 15 seconds, you can skip in 5 seconds', skip }));
    update(ui({ label: 'Ad · 0:14', announcement: 'Ad, 15 seconds, you can skip in 4 seconds', skip }));
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('announces again when the next break starts', () => {
    const { update } = render(ui({ label: 'Ad · 0:10', announcement: 'Ad, 10 seconds' }));
    update(ui({ visible: false }));
    update(ui({ label: 'Ad · 0:10', announcement: 'Ad, 10 seconds' }));
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('tells the screen reader once when Skip becomes possible, not when the ad starts skippable', () => {
    const waiting = { visible: true, enabled: false, label: 'Skip in 1' };
    const ready = { visible: true, enabled: true, label: 'Skip Ad' };
    const { update } = render(ui({ label: 'Ad · 0:15', skip: waiting }));
    update(ui({ label: 'Ad · 0:14', skip: ready, skipAnnouncement: 'You can skip the ad now' }));
    update(ui({ label: 'Ad · 0:13', skip: ready, skipAnnouncement: 'You can skip the ad now' }));
    expect(announce.mock.calls.map((c) => c[0])).toEqual(['Ad 1 of 3, 12 seconds', 'You can skip the ad now']);

    announce.mockClear();
    update(ui({ visible: false }));
    update(ui({ label: 'Ad · 0:10', skip: ready, skipAnnouncement: 'You can skip the ad now' }));
    expect(announce.mock.calls.map((c) => c[0])).toEqual(['Ad 1 of 3, 12 seconds']);
  });

  it('does not say "skip now" for the next ad of a pod that starts skippable', () => {
    const { update } = render(ui({ label: 'Ad 1 of 2 · 0:15', skip: { visible: true, enabled: false, label: 'Skip in 5' } }));
    update(ui({ label: 'Ad 2 of 2 · 0:10', announcement: 'Ad 2 of 2, 10 seconds', skip: { visible: true, enabled: true, label: 'Skip Ad' }, skipAnnouncement: 'You can skip the ad now' }));
    expect(announce.mock.calls.map((c) => c[0])).toEqual(['Ad 1 of 3, 12 seconds', 'Ad 2 of 2, 10 seconds']);
  });
});
