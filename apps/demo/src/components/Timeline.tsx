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
  track: {height: 8, backgroundColor: colors.track, borderRadius: 4},
  played: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.text,
    borderRadius: 4,
  },
  mark: {
    position: 'absolute',
    top: -4,
    width: 6,
    height: 16,
    marginLeft: -3,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  markDone: {opacity: 0.35},
});
