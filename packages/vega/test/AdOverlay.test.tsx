import TestRenderer, { act, ReactTestInstance } from 'react-test-renderer';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import type { AdUiState } from 'react-native-ads-core';
import { AdOverlay, useAdAnnouncements } from '../src/AdOverlay';

const announce = AccessibilityInfo.announceForAccessibility as jest.Mock;

/** Like the core's state: `name` and `timeLeft` are the two parts of `label`. */
function ui(overrides: Partial<AdUiState> = {}): AdUiState {
  const label = overrides.label ?? 'Ad 1 of 3 · 0:12';
  const [name = label, timeLeft = ''] = label.split(' · ');
  return {
    visible: true,
    label,
    name,
    timeLeft,
    skip: { visible: false, enabled: false, label: '', accessibilityLabel: '' },
    announcement: 'Ad 1 of 3, 12 seconds',
    skipAnnouncement: '',
    why: '',
    caption: '',
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
  const skipButton = (): ReactTestInstance | undefined =>
    renderer.root.findAll((n) => n.props.testID === 'vega-ads-skip' && typeof (n.type as unknown) === 'string')[0];
  const texts = (): string[] =>
    renderer.root.findAll((n) => (n.type as unknown) === 'Text').map((n) => String(n.props.children));
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

  it('shows why the break looks as it does when the app turns it on', () => {
    const why = 'No Kettlo ad after a scene with injury';
    expect(render(ui({ why })).texts()).not.toContain(why);

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AdOverlay ui={ui({ why })} onSkip={jest.fn()} showWhy />);
    });
    const line = renderer.root.findAll((n) => n.props.testID === 'vega-ads-why' && (n.type as unknown) === 'Text')[0];
    expect(line?.props.children).toBe(why);
  });

  it('takes the app styles for the label, the why line and Skip, without an own overlay', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    const styles = {
      label: { fontFamily: 'Brand', color: 'gold' },
      why: { fontSize: 30 },
      skip: { borderColor: 'gold' },
      skipText: { fontFamily: 'Brand' },
    };
    act(() => {
      renderer = TestRenderer.create(
        <AdOverlay
          ui={ui({
            why: 'Volume matched to the movie',
            skip: { visible: true, enabled: true, label: 'Skip Ad', accessibilityLabel: 'Skip Ad' },
          })}
          onSkip={jest.fn()}
          showWhy
          styles={styles}
        />,
      );
    });
    const text = (content: string) =>
      renderer.root.findAll((n) => (n.type as unknown) === 'Text' && n.props.children === content)[0];
    expect(StyleSheet.flatten(text('Ad 1 of 3 · 0:12')?.props.style)).toMatchObject({
      fontFamily: 'Brand',
      color: 'gold',
      fontSize: 28,
    });
    expect(StyleSheet.flatten(text('Volume matched to the movie')?.props.style)).toMatchObject({ fontSize: 30 });
    expect(StyleSheet.flatten(text('Skip Ad')?.props.style)).toMatchObject({ fontFamily: 'Brand' });
    const skip = renderer.root.findAll(
      (n) => n.props.testID === 'vega-ads-skip' && typeof (n.type as unknown) === 'string',
    )[0];
    expect(StyleSheet.flatten(skip?.props.style)).toMatchObject({ borderColor: 'gold' });
  });

  it('shows the ad caption at the bottom when the app turns captions on, and never takes touches or focus', () => {
    const caption = 'Slow coffee\nfor long evenings';
    expect(render(ui({ caption })).texts()).not.toContain(caption);

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <AdOverlay ui={ui({ caption })} onSkip={jest.fn()} captions styles={{ caption: { fontSize: 40 } }} />,
      );
    });
    const box = renderer.root.findAll(
      (n) => n.props.testID === 'vega-ads-caption' && (n.type as unknown) === 'View',
    )[0];
    expect(box?.props.pointerEvents).toBe('none');
    expect(StyleSheet.flatten(box?.props.style)).toMatchObject({ position: 'absolute', bottom: expect.any(Number) });
    const text = box?.findAll((n) => (n.type as unknown) === 'Text')[0];
    expect(text?.props.children).toBe(caption);
    expect(StyleSheet.flatten(text?.props.style)).toMatchObject({ fontSize: 40, color: '#fff' });
  });

  it('draws no caption box while there is no caption', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AdOverlay ui={ui()} onSkip={jest.fn()} captions />);
    });
    expect(renderer.root.findAll((n) => n.props.testID === 'vega-ads-caption')).toHaveLength(0);
  });

  it('shows no empty why line', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AdOverlay ui={ui()} onSkip={jest.fn()} showWhy />);
    });
    expect(renderer.root.findAll((n) => n.props.testID === 'vega-ads-why')).toHaveLength(0);
  });

  it('has no Skip button for a non-skippable ad', () => {
    const { skipButton } = render(ui());
    expect(skipButton()).toBeUndefined();
  });

  it('holds the D-pad focus during a non-skippable ad, so the app behind does not react', () => {
    const { renderer } = render(ui());
    const anchor = renderer.root.findAll(
      (n) => n.props.testID === 'vega-ads-focus' && typeof (n.type as unknown) === 'string',
    )[0];
    expect(anchor?.props.hasTVPreferredFocus).toBe(true);
    expect(anchor?.props.accessibilityLabel).toBe('Ad 1 of 3'); // no clock: VoiceView would read it every second
  });

  it('shows a disabled Skip countdown that ignores presses', () => {
    const { skipButton, texts, onSkip } = render(
      ui({ skip: { visible: true, enabled: false, label: 'Skip in 3', accessibilityLabel: 'Skip Ad' } }),
    );
    expect(texts()).toContain('Skip in 3');
    expect(skipButton()?.props.accessibilityState).toEqual({ disabled: true });
    act(() => skipButton()?.props.onPress());
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('takes D-pad focus and skips when Skip is allowed', () => {
    const { skipButton, onSkip } = render(
      ui({ skip: { visible: true, enabled: true, label: 'Skip Ad', accessibilityLabel: 'Skip Ad' } }),
    );
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
    const skip = { visible: true, enabled: false, label: 'Skip in 5', accessibilityLabel: 'Skip Ad' };
    const { update } = render(
      ui({ label: 'Ad · 0:15', announcement: 'Ad, 15 seconds, you can skip in 5 seconds', skip }),
    );
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
    const waiting = { visible: true, enabled: false, label: 'Skip in 1', accessibilityLabel: 'Skip Ad' };
    const ready = { visible: true, enabled: true, label: 'Skip Ad', accessibilityLabel: 'Skip Ad' };
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
    const { update } = render(
      ui({
        label: 'Ad 1 of 2 · 0:15',
        skip: { visible: true, enabled: false, label: 'Skip in 5', accessibilityLabel: 'Skip Ad' },
      }),
    );
    update(
      ui({
        label: 'Ad 2 of 2 · 0:10',
        announcement: 'Ad 2 of 2, 10 seconds',
        skip: { visible: true, enabled: true, label: 'Skip Ad', accessibilityLabel: 'Skip Ad' },
        skipAnnouncement: 'You can skip the ad now',
      }),
    );
    expect(announce.mock.calls.map((c) => c[0])).toEqual(['Ad 1 of 3, 12 seconds', 'Ad 2 of 2, 10 seconds']);
  });
});

describe('useAdAnnouncements', () => {
  function Custom({ state }: { state: AdUiState }) {
    useAdAnnouncements(state);
    return null;
  }

  it('gives an app overlay the same announcements: each ad once, then when Skip opens', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    const waiting = ui({
      skip: { visible: true, enabled: false, label: 'Skip in 3', accessibilityLabel: 'Skip Ad' },
      skipAnnouncement: 'You can skip the ad now',
    });
    act(() => {
      renderer = TestRenderer.create(<Custom state={waiting} />);
    });
    act(() => {
      renderer.update(<Custom state={{ ...waiting, label: 'Ad 1 of 3 · 0:11' }} />);
    });
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Ad 1 of 3, 12 seconds');

    act(() => {
      renderer.update(
        <Custom
          state={{
            ...waiting,
            skip: { visible: true, enabled: true, label: 'Skip ad', accessibilityLabel: 'Skip Ad' },
          }}
        />,
      );
    });
    expect(announce).toHaveBeenLastCalledWith('You can skip the ad now');
  });
});
