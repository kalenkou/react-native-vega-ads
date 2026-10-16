import React from 'react';
import {StyleSheet, View} from 'react-native';
import type {BreakMark} from 'react-native-vega-ads';
import {colors} from '../theme';
import {fraction} from '../time';

export interface TimelineProps {
  position: number;
  duration: number;
  /** Ad breaks from `ads.timeline.marks`: the viewer sees where they are. */
  marks: BreakMark[];
}

/** The progress bar with a mark for every ad break; played breaks fade. */
export const Timeline = ({position, duration, marks}: TimelineProps) => (
  <View style={styles.track} testID="timeline">
    <View
      testID="timeline-played"
      style={[styles.played, {width: `${fraction(position, duration) * 100}%`}]}
    />
    {duration > 0 &&
      marks.map((mark) => (
        <View
          key={mark.id}
          testID={`timeline-mark-${mark.id}`}
          style={[
            styles.mark,
            {left: `${fraction(mark.time, duration) * 100}%`},
            mark.done && styles.markDone,
          ]}
        />
      ))}
  </View>
);

const styles = StyleSheet.create({
  track: {height: 6, backgroundColor: colors.track, borderRadius: 3},
  played: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  mark: {
    position: 'absolute',
    top: -9,
    width: 8,
    height: 24,
    marginLeft: -4,
    borderRadius: 2,
    backgroundColor: colors.adBreak,
  },
  markDone: {opacity: 0.35},
});
