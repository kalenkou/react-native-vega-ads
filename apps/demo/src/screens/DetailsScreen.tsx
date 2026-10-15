import React, {useEffect, useState} from 'react';
import {Image, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {AdIdRetriever} from '@amazon-devices/kepler-adid-retriever';
import {adPlanLabel, useAdPlan} from 'react-native-vega-ads';
import type {Movie} from '../catalog';
import {colors} from '../theme';

export interface DetailsScreenProps {
  movie: Movie;
  /** Title of the movie the second button switches to. */
  next: string;
  /** What the last watch of this title showed and spared the viewer; null before one. */
  lastWatch?: string | null;
  onPlay: () => void;
  /** Plays the movie with ads as usual; no button without it or without a classic schedule. */
  onCompare?: () => void;
  onNext: () => void;
  /** Called when the poster has loaded or failed: the page is fully drawn. */
  onDrawn?: () => void;
}

/** The movie page: poster, story, Play (with the D-pad focus) and a button to the next title. */
export const DetailsScreen = ({
  movie,
  next,
  lastWatch = null,
  onPlay,
  onCompare,
  onNext,
  onDrawn,
}: DetailsScreenProps) => {
  const [focused, setFocused] = useState<'play' | 'compare' | 'next' | null>(
    null,
  );
  useEffect(() => {
    // The first screen is ready: Vega's cool-start KPI ends here.
    (
      globalThis as {performance?: {reportFullyDrawn?: () => void}}
    ).performance?.reportFullyDrawn?.();
  }, []);
  // Ask for the schedule and the pre-roll now: after Play the ad only has to buffer,
  // and the viewer sees how many ads the movie has before pressing Play.
  const plan = useAdPlan({vmapUrl: movie.vmapUrl}, {adId: AdIdRetriever});

  return (
    <View style={styles.root}>
      <Image
        source={{uri: movie.poster}}
        style={styles.poster}
        resizeMode="cover"
        onLoad={onDrawn}
        onError={onDrawn}
      />
      <View style={styles.scrim} />
      <View style={styles.content}>
        <Text style={styles.title}>{movie.title}</Text>
        <Text style={styles.meta}>{movie.meta}</Text>
        {plan && (
          <Text testID="ad-plan" style={styles.adPlan}>
            Ads: {adPlanLabel(plan)}
          </Text>
        )}
        {lastWatch && (
          <Text testID="last-watch" style={styles.adPlan}>
            {lastWatch}
          </Text>
        )}
        <Text style={styles.description}>{movie.description}</Text>
        <View style={styles.buttons}>
          <TouchableOpacity
            testID="play"
            hasTVPreferredFocus
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel={`Play ${movie.title}`}
            onPress={onPlay}
            onFocus={() => setFocused('play')}
            onBlur={() => setFocused(null)}
            style={[styles.button, focused === 'play' && styles.buttonFocused]}>
            <Text
              style={[
                styles.buttonText,
                focused === 'play' && styles.buttonTextFocused,
              ]}>
              ▶ Play
            </Text>
          </TouchableOpacity>
          {onCompare && movie.classicVmapUrl && (
            <TouchableOpacity
              testID="compare"
              activeOpacity={1}
              accessibilityRole="button"
              accessibilityLabel="Compare: play with ads as usual"
              onPress={onCompare}
              onFocus={() => setFocused('compare')}
              onBlur={() => setFocused(null)}
              style={[
                styles.button,
                focused === 'compare' && styles.buttonFocused,
              ]}>
              <Text
                style={[
                  styles.buttonText,
                  focused === 'compare' && styles.buttonTextFocused,
                ]}>
                Compare: ads as usual
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            testID="next"
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel={`Next title: ${next}`}
            onPress={onNext}
            onFocus={() => setFocused('next')}
            onBlur={() => setFocused(null)}
            style={[styles.button, focused === 'next' && styles.buttonFocused]}>
            <Text
              style={[
                styles.buttonText,
                focused === 'next' && styles.buttonTextFocused,
              ]}>
              Next: {next}
            </Text>
          </TouchableOpacity>
        </View>
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
  adPlan: {color: colors.muted, fontSize: 24, marginTop: 8},
  description: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 40,
    marginTop: 32,
  },
  buttons: {flexDirection: 'row', gap: 24, marginTop: 48},
  button: {
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
