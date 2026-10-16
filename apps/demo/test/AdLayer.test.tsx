import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import type {VegaAds} from 'react-native-vega-ads';
import {AdLayer, splitAdLabel} from '../src/components/AdLayer';

function adsWith(ui: Partial<VegaAds['ui']>, skip = jest.fn()): VegaAds {
  return {
    ui: {
      visible: true,
      label: 'Ad 1 of 2 · 0:12',
      skip: {visible: false, enabled: false, label: ''},
      announcement: '',
      skipAnnouncement: '',
      why: 'No Kettlo ad after a scene with injury · Volume matched to the movie',
      ...ui,
    },
    skip,
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

describe('splitAdLabel', () => {
  it('splits the library label into the ad and its clock', () => {
    expect(splitAdLabel('Ad 1 of 2 · 0:12')).toEqual(['AD 1/2', '0:12']);
    expect(splitAdLabel('Werbung')).toEqual(['Werbung', '']);
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
