import React from 'react';
import {Text, View} from 'react-native';
import {layoutScale, type AdPlan} from 'react-native-vega-ads';
import {colors, fonts, layoutStyles} from '../theme';
import {markFraction, timecode} from '../time';

export interface BreakMapProps {
  plan: AdPlan;
  /** Length of the movie in seconds. */
  duration: number;
  /** "1 ad, 10 s, skippable after 5 s": what plays right after Play. */
  prerollLabel: string;
}

const WIDTH = 1728;

function markLabel(
  mark: AdPlan['marks'][number],
  duration: number,
): {time: string; note: string} {
  switch (mark.at.kind) {
    case 'start':
      return {time: 'pre-roll', note: ''};
    case 'end':
      return {time: `post-roll · ${timecode(Math.floor(duration))}`, note: ''};
    case 'percent':
      return {
        time: timecode((mark.at.percent / 100) * duration),
        note: mark.sceneSignals.join(', '),
      };
    default:
      return {
        time: timecode(mark.at.seconds),
        note: mark.sceneSignals.join(', '),
      };
  }
}

/**
 * The ad breaks of the title on its timeline, before Play: where each one is (VMAP time) and,
 * when the VMAP says so, what the scene before it shows.
 */
export const BreakMap = ({plan, duration, prerollLabel}: BreakMapProps) => (
  <View testID="break-map" style={styles.root}>
    <View style={styles.header}>
      <Text style={styles.heading}>Break map</Text>
      <Text style={styles.subtitle}>
        Placed before any ad is asked for: shot changes, silent frames, no line
        of dialogue cut
      </Text>
    </View>
    <View style={styles.track}>
      <View style={styles.line} />
      {plan.marks.map((mark, index) => {
        // In the 1920x1080 layout, like the styles: the place is scaled the same way.
        const x = markFraction(mark.at, duration) * WIDTH;
        const atEnd = x > WIDTH - 360;
        const {time, note} = markLabel(mark, duration);
        const top = index === 0 ? prerollLabel : note && `after: ${note}`;
        return (
          <View
            key={`${index}-${time}`}
            testID={`break-map-mark-${index}`}
            style={[
              styles.mark,
              atEnd
                ? [styles.markEnd, {right: (WIDTH - x) * layoutScale()}]
                : {left: x * layoutScale()},
            ]}>
            <Text style={styles.note}>{top}</Text>
            <View style={styles.tick} />
            <Text style={styles.time}>{time}</Text>
          </View>
        );
      })}
    </View>
  </View>
);

const styles = layoutStyles({
  root: {width: WIDTH},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  heading: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 34,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  subtitle: {color: colors.muted, fontFamily: fonts.body, fontSize: 24},
  track: {height: 160, marginTop: 18},
  line: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 76,
    height: 4,
    backgroundColor: colors.line,
  },
  mark: {position: 'absolute', top: 0, width: 360},
  markEnd: {alignItems: 'flex-end'},
  note: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 22,
    height: 30,
  },
  tick: {width: 6, height: 84, marginTop: 4, backgroundColor: colors.adBreak},
  time: {
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 22,
    marginTop: 6,
  },
});
