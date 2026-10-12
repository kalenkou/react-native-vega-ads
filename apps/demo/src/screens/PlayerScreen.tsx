import React, {useEffect} from 'react';
import {BackHandler, StyleSheet, Text} from 'react-native';
import {AdIdRetriever} from '@amazon-devices/kepler-adid-retriever';
import AsyncStorage from '@amazon-devices/react-native-async-storage__async-storage';
import {VegaAdsPlayer, type RepeatOptions} from 'react-native-vega-ads';
import {adsMode} from '../adsMode';
import type {Movie} from '../catalog';
import {PlayerChrome} from '../components/PlayerChrome';
import {colors} from '../theme';

export interface PlayerScreenProps {
  movie: Movie;
  /** Ads as usual, to compare with (the "Compare" button). */
  classic?: boolean;
  onClose: () => void;
  /** IAB events and errors, for the on-screen log in the demo video. */
  onEvent?: (name: string) => void;
}

/**
 * Back outside ads closes the player. During ads VegaAdsPlayer returns to the movie first, and
 * on a pause ad it closes the ad first.
 */
function useBackToClose(onClose: () => void): void {
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onClose();
        return true;
      },
    );
    return () => subscription.remove();
  }, [onClose]);
}

/**
 * The household sees a creative once in 30 minutes, in any title and after a relaunch:
 * the creatives shown are kept on the device under one key.
 */
const SEEN_KEY = 'vega-ads.seen';
const AVOID_REPEATS: RepeatOptions = {
  memory: {
    read: () => AsyncStorage.getItem(SEEN_KEY),
    write: (value) => AsyncStorage.setItem(SEEN_KEY, value),
  },
};

/** The whole integration: one component, the app's own controls as children. */
export const PlayerScreen = ({
  movie,
  classic = false,
  onClose,
  onEvent,
}: PlayerScreenProps) => {
  useBackToClose(onClose);
  const mode = adsMode(movie, classic, AVOID_REPEATS);
  return (
    <VegaAdsPlayer
      source={{uri: movie.uri}}
      ads={mode.ads}
      pauseAdUrl={mode.pauseAdUrl}
      pauseAdStyle={styles.pauseAd}
      avoidRepeats={mode.avoidRepeats}
      contentLoudness={mode.contentLoudness}
      adId={AdIdRetriever}
      showWhy={mode.showWhy}
      countdown={mode.countdown}
      onEnd={onClose}
      onEvent={onEvent}>
      {({player, ads}) => (
        <>
          <PlayerChrome title={movie.title} player={player} ads={ads} />
          {classic && (
            <Text testID="classic-badge" style={styles.badge}>
              Ads as usual · for comparison
            </Text>
          )}
        </>
      )}
    </VegaAdsPlayer>
  );
};

const styles = StyleSheet.create({
  // Between the title and the controls of PlayerChrome.
  pauseAd: {top: 100, bottom: 220},
  // Above the ad surfaces (zIndex 2-3) and PlayerChrome (5), under the ad label (10).
  badge: {
    position: 'absolute',
    top: 40,
    right: 64,
    zIndex: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.scrim,
    color: colors.accent,
    fontSize: 22,
  },
});
