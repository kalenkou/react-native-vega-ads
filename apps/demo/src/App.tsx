import React, {useCallback, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {MOVIES} from './catalog';
import {colors} from './theme';
import {DetailsScreen} from './screens/DetailsScreen';
import {PlayerScreen} from './screens/PlayerScreen';

/** Two screens: the movie page and the player. */
export const App = () => {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const movie = MOVIES[index];
  const next = MOVIES[(index + 1) % MOVIES.length];
  const play = useCallback(() => {
    console.log('[demo] play');
    setPlaying(true);
  }, []);
  const close = useCallback(() => setPlaying(false), []);
  const showNext = useCallback(
    () => setIndex((current) => (current + 1) % MOVIES.length),
    [],
  );
  return (
    <View style={styles.root}>
      {playing ? (
        <PlayerScreen
          movie={movie}
          onClose={close}
          onEvent={(name) => console.log(`[ads] ${name}`)}
        />
      ) : (
        <DetailsScreen
          movie={movie}
          next={next.title}
          onPlay={play}
          onNext={showNext}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},
});
