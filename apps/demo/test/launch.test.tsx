import React from 'react';
import {AppState} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';

const mockReportFullyDrawn = jest.fn();
const mockHideSplash = jest.fn();
const mockPreventHide = jest.fn();
jest.mock('@amazon-devices/kepler-performance-api', () => ({
  useReportFullyDrawn: () => mockReportFullyDrawn,
}));
jest.mock('@amazon-devices/react-native-kepler', () => ({
  usePreventHideSplashScreen: () => mockPreventHide(),
  useHideSplashScreenCallback: () => mockHideSplash,
}));

import {useLaunchReady} from '../src/launch';

let onReady: () => void = () => undefined;
const Probe = () => {
  onReady = useLaunchReady();
  return null;
};

describe('useLaunchReady', () => {
  let appStateListener: (state: string) => void = () => undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, listener) => {
        appStateListener = listener as (state: string) => void;
        return {remove: jest.fn()} as never;
      });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('keeps the system splash until the first screen is ready, then reports fully drawn and hides it once', () => {
    act(() => {
      TestRenderer.create(<Probe />);
    });
    expect(mockPreventHide).toHaveBeenCalled();
    expect(mockHideSplash).not.toHaveBeenCalled();

    act(() => onReady());
    act(() => onReady());

    expect(mockReportFullyDrawn).toHaveBeenCalledTimes(1);
    expect(mockHideSplash).toHaveBeenCalledTimes(1);
  });

  it('hides the splash after 5 s if the first screen never says it is ready', () => {
    act(() => {
      TestRenderer.create(<Probe />);
    });
    act(() => {
      jest.advanceTimersByTime(4999);
    });
    expect(mockHideSplash).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(mockHideSplash).toHaveBeenCalledTimes(1);
    expect(mockReportFullyDrawn).toHaveBeenCalledTimes(1);
  });

  it('reports fully drawn again when the app comes back to the foreground', () => {
    act(() => {
      TestRenderer.create(<Probe />);
    });
    act(() => onReady());

    act(() => appStateListener('background'));
    act(() => appStateListener('active'));

    expect(mockReportFullyDrawn).toHaveBeenCalledTimes(2);
    expect(mockHideSplash).toHaveBeenCalledTimes(1);
  });
});
