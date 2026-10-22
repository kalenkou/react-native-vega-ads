import React from 'react';
import {Image} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';

const mockUseAdPlan = jest.fn();
jest.mock('react-native-vega-ads', () => ({
  scaleStyles: (styles: object) => styles,
  layoutScale: () => 1,
  adPlanLabel: () => '1 ad',
  useAdPlan: (schedule: unknown, options: unknown) =>
    mockUseAdPlan(schedule, options),
}));
// Counts every read of the ad ID module. On a cold start its first read waits for Vega's ad ID
// service and holds the JavaScript thread for 1.4 to 2.6 s (FL-38).
const mockReadAdId = jest.fn();
const mockRetriever = {
  isAdvertisingTrackingEnabled: () => true,
  fetchAdvertisingId: () => 'ifa',
};
jest.mock('@amazon-devices/kepler-adid-retriever', () => ({
  get AdIdRetriever() {
    mockReadAdId();
    return mockRetriever;
  },
}));
jest.mock('../src/components/BreakMap', () => ({BreakMap: () => null}));

import {DetailsScreen} from '../src/screens/DetailsScreen';
import type {Movie} from '../src/catalog';

const movie = {
  title: 'Sintel',
  meta: '2010 · 15 min · Fantasy',
  description: 'A girl looks for a dragon.',
  duration: 888,
  credit: '(CC) Blender Foundation',
  uri: 'http://media.test/sintel.mp4',
  poster: 'http://media.test/sintel.jpg',
  vmapUrl: 'http://media.test/sintel.xml',
  pauseAdUrl: 'http://media.test/pause.xml',
  contentLoudness: -23,
} as Movie;

const plan = {breaks: 4, preroll: null, marks: []};

describe('DetailsScreen', () => {
  beforeEach(() => {
    mockReadAdId.mockClear();
    mockUseAdPlan.mockReset().mockReturnValue(plan);
  });

  function render(onDrawn = jest.fn()) {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <DetailsScreen
          movie={movie}
          next="Tears of Steel"
          onPlay={jest.fn()}
          onNext={jest.fn()}
          onDrawn={onDrawn}
        />,
      );
    });
    return renderer;
  }

  it('does not read the ad ID module or ask for the ad plan before the poster is drawn', () => {
    const renderer = render();
    expect(mockReadAdId).not.toHaveBeenCalled();
    expect(mockUseAdPlan).not.toHaveBeenCalled();
    expect(renderer.root.findAllByProps({testID: 'ad-plan'})).toHaveLength(0);
  });

  it.each(['onLoad', 'onError'] as const)(
    'asks for the ad plan with the ad ID after the poster %s',
    (event) => {
      const onDrawn = jest.fn();
      const renderer = render(onDrawn);
      act(() => {
        renderer.root.findByType(Image).props[event]();
      });
      expect(onDrawn).toHaveBeenCalledTimes(1);
      expect(mockUseAdPlan).toHaveBeenCalledWith(
        {vmapUrl: movie.vmapUrl},
        {adId: mockRetriever},
      );
      expect(
        renderer.root.findAllByProps({testID: 'ad-plan'}).length,
      ).toBeGreaterThan(0);
    },
  );
});
