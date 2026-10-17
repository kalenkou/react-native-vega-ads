import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {StyleSheet} from 'react-native';
import type {VegaAds} from 'react-native-vega-ads';
import {AdLayer, adBadge} from '../src/components/AdLayer';

// The library's player modules load the w3cmedia Turbo Module, which Jest does not have.
jest.mock('@amazon-devices/react-native-w3cmedia', () => ({
  KeplerVideoSurfaceView: 'KeplerVideoSurfaceView',
  VideoPlayer: class {},
  KeplerMediaControlHandler: class {},
}));

// TouchableOpacity animates its opacity on press with requestAnimationFrame: a setTimeout in the
// Kepler Jest setup whose callback calls jest.now(), which this Jest does not have. With real
// timers it fires after the test and stops the whole run; fake timers drop it.
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

function adsWith(ui: Partial<VegaAds['ui']>, skip = jest.fn()): VegaAds {
  return {
    ui: {
      visible: true,
      label: 'Ad 1 of 2 · 0:12',
      name: 'Ad 1 of 2',
      timeLeft: '0:12',
      skip: {visible: false, enabled: false, label: ''},
      announcement: '',
      skipAnnouncement: '',
      caption: '',
      why: 'No Kettlo ad after a scene with injury · Volume matched to the movie',
      ...ui,
    },
    skip,
    snapshot: {position: 1, total: 2},
    timeline: {marks: [], nextBreakIn: null},
  } as unknown as VegaAds;
}

function texts(ads: VegaAds, showWhy: boolean): string[] {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <AdLayer
        title="Sintel"
        ads={ads}
        position={162.4}
        duration={888.1}
        showWhy={showWhy}
      />,
    );
  });
  return renderer.root
    .findAll((n) => (n.type as unknown) === 'Text')
    .map((n) => [n.props.children].flat().join(''));
}

describe('adBadge', () => {
  it('numbers the ad in a pod and leaves a single ad unnumbered', () => {
    expect(adBadge(adsWith({}))).toBe('AD 1/2');
    expect(
      adBadge({snapshot: {position: 1, total: 1}} as unknown as VegaAds),
    ).toBe('AD');
  });
});

describe('AdLayer', () => {
  it('names the ad, where the movie stopped, and why the break looks as it does', () => {
    const shown = texts(adsWith({}), true);
    expect(shown).toContain('AD 1/2');
    expect(shown).toContain('0:12');
    expect(shown).toContain('Sintel · break at 00:02:42');
    expect(shown).toContain(
      'No Kettlo ad after a scene with injury · Volume matched to the movie',
    );
    expect(shown).toContain('00:14:48');
  });

  it('leaves the why line out when the mode does not show it', () => {
    expect(texts(adsWith({}), false).join('\n')).not.toContain('Kettlo');
  });

  it('skips only once Skip is enabled', () => {
    const skip = jest.fn();
    const waiting = adsWith(
      {skip: {visible: true, enabled: false, label: 'Skip in 3'}},
      skip,
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <AdLayer
          title="Sintel"
          ads={waiting}
          position={0}
          duration={1}
          showWhy
        />,
      );
    });
    const button = () =>
      renderer.root.findAll(
        (n) => n.props.testID === 'vega-ads-skip' && n.props.onPress,
      )[0];
    act(() => button().props.onPress());
    expect(skip).not.toHaveBeenCalled();

    const ready = adsWith(
      {skip: {visible: true, enabled: true, label: 'Skip ad'}},
      skip,
    );
    act(() => {
      renderer.update(
        <AdLayer
          title="Sintel"
          ads={ready}
          position={0}
          duration={1}
          showWhy
        />,
      );
    });
    act(() => button().props.onPress());
    expect(skip).toHaveBeenCalledTimes(1);
  });

  it('shows the ad caption at the bottom when the viewer has captions on, in their size', () => {
    const ads = adsWith({caption: 'Kettlebells that last'});
    const draw = (captions?: {enabled: boolean; fontSize: number}) => {
      let renderer!: TestRenderer.ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(
          <AdLayer
            title="Sintel"
            ads={ads}
            position={0}
            duration={1}
            showWhy={false}
            captions={captions}
          />,
        );
      });
      return renderer.root.findAll(
        (n) =>
          n.props.testID === 'ad-caption' && (n.type as unknown) === 'View',
      )[0];
    };
    expect(draw()).toBeUndefined();
    expect(draw({enabled: false, fontSize: 36})).toBeUndefined();
    const box = draw({enabled: true, fontSize: 46});
    expect(box?.props.pointerEvents).toBe('none');
    const text = box?.findAll((n) => (n.type as unknown) === 'Text')[0];
    expect(text?.props.children).toBe('Kettlebells that last');
    expect(StyleSheet.flatten(text?.props.style)).toMatchObject({
      fontSize: 46,
    });
  });

  it('draws nothing outside an ad', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <AdLayer
          title="Sintel"
          ads={adsWith({visible: false})}
          position={0}
          duration={1}
          showWhy
        />,
      );
    });
    expect(renderer.toJSON()).toBeNull();
  });
});
