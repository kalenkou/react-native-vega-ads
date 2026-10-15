import React, {useCallback, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {watchReport, watchReportLabel} from 'react-native-vega-ads';
import {MOVIES} from './catalog';
import {useLaunchReady} from './launch';
import {colors} from './theme';
import {DetailsScreen} from './screens/DetailsScreen';
import {PlayerScreen} from './screens/PlayerScreen';

interface LastWatch {
  index: number;
  classic: boolean;
  label: string;
}

/** Two screens: the movie page and the player. */
export const App = () => {
  // First: the system splash stays until the movie page has its poster.
  const onFirstScreenDrawn = useLaunchReady();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [classic, setClassic] = useState(false);
  const [lastWatch, setLastWatch] = useState<LastWatch | null>(null);
  // The ad events of the current watch, for the report after it.
  const events = useRef<string[]>([]);
  const movie = MOVIES[index];
  const next = MOVIES[(index + 1) % MOVIES.length];
  const start = useCallback((asUsual: boolean) => {
    console.log(asUsual ? '[demo] play, ads as usual' : '[demo] play');
    events.current = [];
    setClassic(asUsual);
    setPlaying(true);
  }, []);
  const play = useCallback(() => start(false), [start]);
  const compare = useCallback(() => start(true), [start]);
  const onEvent = useCallback((name: string) => {
    events.current.push(name);
    console.log(`[ads] ${name}`);
  }, []);
  const close = useCallback(() => {
    const report = watchReport(events.current);
    console.log(`[demo] report ${JSON.stringify(report)}`);
    setLastWatch({index, classic, label: watchReportLabel(report)});
    setPlaying(false);
  }, [index, classic]);
  const showNext = useCallback(
    () => setIndex((current) => (current + 1) % MOVIES.length),
    [],
  );
  return (
    <View style={styles.root}>
      {playing ? (
        <PlayerScreen
          movie={movie}
          classic={classic}
          onClose={close}
          onEvent={onEvent}
        />
      ) : (
        <DetailsScreen
          movie={movie}
          next={next.title}
          lastWatch={
            lastWatch?.index === index && lastWatch.label !== ''
              ? `${
                  lastWatch.classic ? 'Last watch, ads as usual' : 'Last watch'
                }: ${lastWatch.label}`
              : null
          }
          onPlay={play}
          onCompare={compare}
          onNext={showNext}
          onDrawn={onFirstScreenDrawn}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},
});
