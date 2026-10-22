import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {Dimensions, StyleSheet} from 'react-native';
import type {AdPlan} from 'react-native-vega-ads';
import {BreakMap} from '../src/components/BreakMap';

const PLAN = {
  marks: [
    {at: {kind: 'start'}, sceneSignals: []},
    {at: {kind: 'time', seconds: 139.917}, sceneSignals: []},
    {at: {kind: 'time', seconds: 441.208}, sceneSignals: []},
    {at: {kind: 'percent', percent: 95}, sceneSignals: []},
    {at: {kind: 'end'}, sceneSignals: []},
  ],
} as unknown as AdPlan;

/** The place of each mark on the map: its left or right edge. */
function places() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <BreakMap plan={PLAN} duration={734} prerollLabel="1 ad" />,
    );
  });
  return [0, 1, 2, 3, 4].map((index) => {
    const mark = renderer.root.findAll(
      (n) =>
        n.props.testID === `break-map-mark-${index}` &&
        (n.type as unknown) === 'View',
    )[0];
    const {left, right} = StyleSheet.flatten(mark?.props.style) as {
      left?: number;
      right?: number;
    };
    return left !== undefined
      ? {left: Math.round(left)}
      : {right: Math.round((right ?? NaN) * 10) / 10};
  });
}

describe('BreakMap', () => {
  it('places each break on the 1728-wide map of the 1920x1080 layout', () => {
    expect(places()).toEqual([
      {left: 0},
      {left: 329},
      {left: 1039},
      {right: 86.4},
      {right: 0},
    ]);
  });

  it('places them at half the numbers on the 960x540 dp canvas of React Native 0.83', () => {
    const get = jest.spyOn(Dimensions, 'get');
    get.mockReturnValue({width: 960, height: 540, scale: 2, fontScale: 2});
    try {
      expect(places()).toEqual([
        {left: 0},
        {left: 165},
        {left: 519},
        {right: 43.2},
        {right: 0},
      ]);
    } finally {
      get.mockReturnValue({width: 1920, height: 1080, scale: 1, fontScale: 1});
    }
  });
});
