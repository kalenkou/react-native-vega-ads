import React from 'react';
import {Image} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';

const mockUseAdPlan = jest.fn();
jest.mock('react-native-vega-ads', () => ({
  scaleStyles: (styles: object) => styles,
  layoutScale: () => 1,
  adPlanLabel: (plan: {label: string}) => plan.label,
  useAdPlan: (schedule: unknown, options: unknown) =>
    mockUseAdPlan(schedule, options),
}));
// Counts every read of the ad ID module. On a cold start its first read waits for Vega's ad ID
// service and holds the JavaScript thread for 0.5 to 2.6 s (FL-38).
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
// Every render of the break map: which plan it drew against which movie length.
const mockBreakMap = jest.fn();
jest.mock('../src/components/BreakMap', () => ({
  BreakMap: (props: unknown) => {
    mockBreakMap(props);
    return null;
  },
}));

import {DetailsScreen} from '../src/screens/DetailsScreen';
import type {Movie} from '../src/catalog';

// A read at import time (for example a module-level options object) loads the module with the
// bundle on the device, before any screen: the test must see it before beforeEach clears the mock.
const readsAtImport = mockReadAdId.mock.calls.length;

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

const sintel = {...movie, title: 'Sintel'};
const tears = {
  ...movie,
  title: 'Tears of Steel',
  duration: 734,
  poster: 'http://media.test/tears.jpg',
  vmapUrl: 'http://media.test/tears.xml',
} as Movie;
const plan = {label: '4 ad breaks', breaks: 4, preroll: null, marks: [162]};
const tearsPlan = {...plan, label: '3 ad breaks', marks: [140]};

describe('DetailsScreen', () => {
  beforeEach(() => {
    mockReadAdId.mockClear();
    mockBreakMap.mockClear();
    mockUseAdPlan
      .mockReset()
      .mockImplementation((schedule: {vmapUrl: string}) =>
        schedule.vmapUrl === tears.vmapUrl ? tearsPlan : plan,
      );
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

  it('does not read the ad ID module when the screen module loads', () => {
    expect(readsAtImport).toBe(0);
  });

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

  it("never draws the previous movie's plan after Next", () => {
    const props = {next: 'x', onPlay: jest.fn(), onNext: jest.fn()};
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <DetailsScreen movie={sintel} {...props} />,
      );
    });
    act(() => {
      renderer.root.findByType(Image).props.onLoad();
    });
    mockBreakMap.mockClear();
    act(() => {
      renderer.update(<DetailsScreen movie={tears} {...props} />);
    });
    const drawn = mockBreakMap.mock.calls.map(
      ([p]: [{plan: {label: string}; duration: number}]) =>
        `${p.plan.label}@${p.duration}`,
    );
    expect(drawn).not.toContain('4 ad breaks@734');
    expect(drawn).toContain('3 ad breaks@734');
  });
});
