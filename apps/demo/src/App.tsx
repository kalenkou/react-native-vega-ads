import React, {useCallback, useEffect, useRef, useState} from 'react';
import {View} from 'react-native';
import {watchReport, watchReportLabel} from 'react-native-vega-ads';
import {MOVIES} from './catalog';
import {useLaunchReady} from './launch';
import {deviceResume} from './resume';
import {colors, layoutStyles} from './theme';
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
  // Left on the device when the system ended the app during the movie; cleared after a watch.
  const [resumeAt, setResumeAt] = useState<number | null>(null);
  const [startAt, setStartAt] = useState<number | undefined>(undefined);
  useEffect(() => {
    let current = true;
    setResumeAt(null);
    deviceResume
      .read(movie.uri)
      .then((at) => current && setResumeAt(at))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [movie.uri]);
  const start = useCallback((asUsual: boolean, at?: number) => {
    console.log(
      asUsual
        ? '[demo] play, ads as usual'
        : `[demo] play${at === undefined ? '' : ` from ${at.toFixed(1)}`}`,
    );
    events.current = [];
    setClassic(asUsual);
    setStartAt(at);
    setPlaying(true);
  }, []);
  // Reads the saved place again: Play can come before the page has it.
  const play = useCallback(() => {
    deviceResume
      .read(movie.uri)
      .catch(() => null)
      .then((at) => start(false, at ?? undefined));
  }, [start, movie.uri]);
  const compare = useCallback(() => start(true), [start]);
  const onEvent = useCallback((name: string) => {
    events.current.push(name);
    console.log(`[ads] ${name}`);
  }, []);
  const close = useCallback(() => {
    const report = watchReport(events.current);
    console.log(`[demo] report ${JSON.stringify(report)}`);
    setLastWatch({index, classic, label: watchReportLabel(report)});
    deviceResume.clear(movie.uri).catch(() => undefined);
    setResumeAt(null);
    setPlaying(false);
  }, [index, classic, movie.uri]);
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
          startAt={startAt}
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
          resumeAt={resumeAt}
          onCompare={compare}
          onNext={showNext}
          onDrawn={onFirstScreenDrawn}
        />
      )}
    </View>
  );
};

const styles = layoutStyles({
  root: {flex: 1, backgroundColor: colors.background},
});
