import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {ActivityIndicator, Text} from 'react-native';
import type {VegaAds, W3cVideoPlayer} from 'react-native-vega-ads';

// The library's player modules load the w3cmedia Turbo Module, which Jest does not have.
jest.mock('@amazon-devices/react-native-w3cmedia', () => ({
  KeplerVideoSurfaceView: 'KeplerVideoSurfaceView',
  VideoPlayer: class {},
  KeplerMediaControlHandler: class {},
}));
jest.mock('../src/remote', () => ({useRemoteKeys: () => undefined}));

import {PlayerChrome} from '../src/components/PlayerChrome';

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

/** A content player that only records its listeners, so a test can fire its events. */
function fakePlayer() {
  const listeners = new Map<string, Array<() => void>>();
  const player = {
    currentTime: 0,
    duration: 734,
    addEventListener: (type: string, listener: () => void) =>
      listeners.set(type, [...(listeners.get(type) ?? []), listener]),
    removeEventListener: () => undefined,
  };
  const fire = (type: string) =>
    act(() => (listeners.get(type) ?? []).forEach((listener) => listener()));
  return {player: player as unknown as W3cVideoPlayer, fire};
}

function ads(playing: boolean): VegaAds {
  return {
    playing,
    ui: {
      visible: playing,
      label: 'Ad · 0:10',
      name: 'Ad',
      timeLeft: '0:10',
      skip: {visible: false, enabled: false, label: '', accessibilityLabel: ''},
      announcement: '',
      skipAnnouncement: '',
      caption: '',
      why: '',
    },
    skip: jest.fn(),
    snapshot: {position: 1, total: 1},
    timeline: {marks: [], nextBreakIn: null},
  } as unknown as VegaAds;
}

function render(player: W3cVideoPlayer, playing = false) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <PlayerChrome
        title="Tears of Steel"
        poster="http://media.test/tears.jpg"
        player={player}
        ads={ads(playing)}
      />,
    );
  });
  return renderer;
}

const texts = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map((node) => node.props.children);

describe('PlayerChrome before the first frame', () => {
  it('shows a loading screen, not "Playing 00:00:00", while the pre-roll loads', () => {
    const {player} = fakePlayer();
    const renderer = render(player);
    expect(
      renderer.root.findAllByProps({testID: 'player-loading'}).length,
    ).toBeGreaterThan(0);
    expect(texts(renderer)).not.toContain('Playing');
    expect(renderer.root.findAllByType(ActivityIndicator)).toHaveLength(1);
  });

  it('shows the controls once the movie plays', () => {
    const {player, fire} = fakePlayer();
    const renderer = render(player);
    fire('playing');
    expect(
      renderer.root.findAllByProps({testID: 'player-loading'}),
    ).toHaveLength(0);
    expect(texts(renderer)).toContain('Playing');
  });

  it('never shows the loading screen again after an ad has played', () => {
    const {player} = fakePlayer();
    const renderer = render(player, true);
    act(() => {
      renderer.update(
        <PlayerChrome
          title="Tears of Steel"
          poster="http://media.test/tears.jpg"
          player={player}
          ads={ads(false)}
        />,
      );
    });
    expect(
      renderer.root.findAllByProps({testID: 'player-loading'}),
    ).toHaveLength(0);
  });

  it('drops the loading screen after 8 s even without a player event', () => {
    const {player} = fakePlayer();
    const renderer = render(player);
    act(() => {
      jest.advanceTimersByTime(8000);
    });
    expect(
      renderer.root.findAllByProps({testID: 'player-loading'}),
    ).toHaveLength(0);
  });
});
