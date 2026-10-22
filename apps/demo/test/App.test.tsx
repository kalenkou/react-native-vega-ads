import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';

jest.mock('react-native-vega-ads', () => ({
  scaleStyles: (styles: object) => styles,
  watchReport: () => ({}),
  watchReportLabel: () => '',
}));
jest.mock('../src/catalog', () => ({
  MOVIES: [
    {title: 'Tears of Steel', uri: 'http://media.test/tears.mov'},
    {title: 'Sintel', uri: 'http://media.test/sintel.mp4'},
  ],
}));
jest.mock('../src/launch', () => ({useLaunchReady: () => () => undefined}));
const mockRead = jest.fn();
jest.mock('../src/resume', () => ({
  deviceResume: {
    read: (uri: string) => mockRead(uri),
    clear: () => Promise.resolve(),
  },
}));
jest.mock('../src/screens/DetailsScreen', () => ({DetailsScreen: () => null}));
jest.mock('../src/screens/PlayerScreen', () => ({PlayerScreen: () => null}));

import {App} from '../src/App';
import {DetailsScreen} from '../src/screens/DetailsScreen';
import {PlayerScreen} from '../src/screens/PlayerScreen';

describe('App', () => {
  /** The device answers every read of the saved place only when the test says so. */
  let answer: (at: number | null) => void = () => undefined;

  beforeEach(() => {
    const waiting: Array<(at: number | null) => void> = [];
    mockRead.mockReset().mockImplementation(
      () =>
        new Promise<number | null>((resolve) => {
          waiting.push(resolve);
        }),
    );
    answer = (at) => waiting.splice(0).forEach((resolve) => resolve(at));
  });

  function pressPlayAtOnce() {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<App />);
    });
    act(() => {
      renderer.root.findByType(DetailsScreen).props.onPlay();
    });
    return renderer;
  }

  it('Play pressed while the saved place is still loading continues there', async () => {
    const renderer = pressPlayAtOnce();
    await act(async () => answer(11.6));
    expect(renderer.root.findByType(PlayerScreen).props.startAt).toBe(11.6);
  });

  it('Play starts from the beginning when nothing is saved', async () => {
    const renderer = pressPlayAtOnce();
    await act(async () => answer(null));
    expect(
      renderer.root.findByType(PlayerScreen).props.startAt,
    ).toBeUndefined();
  });
});
