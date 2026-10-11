import React, {useCallback, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {MOVIE} from './catalog';
import {colors} from './theme';
import {DetailsScreen} from './screens/DetailsScreen';
import {PlayerScreen} from './screens/PlayerScreen';

/** Two screens: the movie page and the player. */
export const App = () => {
  const [playing, setPlaying] = useState(false);
  const play = useCallback(() => {
    console.log('[demo] play');
    setPlaying(true);
  }, []);
  const close = useCallback(() => setPlaying(false), []);
  return (
    <View style={styles.root}>
      {playing ? (
        <PlayerScreen
          movie={MOVIE}
          onClose={close}
          onEvent={(name) => console.log(`[ads] ${name}`)}
        />
      ) : (
        <DetailsScreen movie={MOVIE} onPlay={play} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},
});
