import React, {useEffect, useState} from 'react';
import {Image, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import type {Movie} from '../catalog';
import {colors} from '../theme';

export interface DetailsScreenProps {
  movie: Movie;
  onPlay: () => void;
}

/** The movie page: poster, story, one Play button with the D-pad focus. */
export const DetailsScreen = ({movie, onPlay}: DetailsScreenProps) => {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    // The first screen is ready: Vega's cool-start KPI ends here.
    (
      globalThis as {performance?: {reportFullyDrawn?: () => void}}
    ).performance?.reportFullyDrawn?.();
  }, []);

  return (
    <View style={styles.root}>
      <Image
        source={{uri: movie.poster}}
        style={styles.poster}
        resizeMode="cover"
      />
      <View style={styles.scrim} />
      <View style={styles.content}>
        <Text style={styles.title}>{movie.title}</Text>
        <Text style={styles.meta}>{movie.meta}</Text>
        <Text style={styles.description}>{movie.description}</Text>
        <TouchableOpacity
          testID="play"
          hasTVPreferredFocus
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel={`Play ${movie.title}`}
          onPress={onPlay}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.button, focused && styles.buttonFocused]}>
          <Text
            style={[styles.buttonText, focused && styles.buttonTextFocused]}>
            ▶ Play
          </Text>
        </TouchableOpacity>
        <Text style={styles.note}>
          Ad breaks wait for shot changes and silent black frames. You can skip
          after 5 s.
        </Text>
      </View>
      <Text style={styles.credit}>{movie.credit}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},
  poster: {position: 'absolute', top: 0, bottom: 0, left: 0, right: 0},
  scrim: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(11,13,18,0.72)',
  },
  content: {position: 'absolute', left: 96, top: 160, width: 900},
  title: {color: colors.text, fontSize: 72, fontWeight: '700'},
  meta: {color: colors.muted, fontSize: 28, marginTop: 12},
  description: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 40,
    marginTop: 32,
  },
  button: {
    alignSelf: 'flex-start',
    marginTop: 48,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: colors.track,
  },
  buttonFocused: {backgroundColor: colors.focus, borderColor: colors.focus},
  buttonText: {color: colors.text, fontSize: 30, fontWeight: '600'},
  buttonTextFocused: {color: colors.background},
  note: {color: colors.muted, fontSize: 22, marginTop: 32},
  credit: {
    position: 'absolute',
    left: 96,
    bottom: 40,
    color: colors.muted,
    fontSize: 18,
  },
});
