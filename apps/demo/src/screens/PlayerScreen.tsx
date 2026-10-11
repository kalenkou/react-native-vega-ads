import React, {useEffect} from 'react';
import {BackHandler, StyleSheet} from 'react-native';
import {AdIdRetriever} from '@amazon-devices/kepler-adid-retriever';
import AsyncStorage from '@amazon-devices/react-native-async-storage__async-storage';
import {VegaAdsPlayer, type RepeatOptions} from 'react-native-vega-ads';
import type {Movie} from '../catalog';
import {PlayerChrome} from '../components/PlayerChrome';

export interface PlayerScreenProps {
  movie: Movie;
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
    write: value => AsyncStorage.setItem(SEEN_KEY, value),
  },
};

/** The whole integration: one component, the app's own controls as children. */
export const PlayerScreen = ({movie, onClose, onEvent}: PlayerScreenProps) => {
  useBackToClose(onClose);
  return (
    <VegaAdsPlayer
      source={{uri: movie.uri}}
      ads={{vmapUrl: movie.vmapUrl}}
      pauseAdUrl={movie.pauseAdUrl}
      pauseAdStyle={styles.pauseAd}
      avoidRepeats={AVOID_REPEATS}
      contentLoudness={movie.contentLoudness}
      adId={AdIdRetriever}
      onEnd={onClose}
      onEvent={onEvent}>
      {({player, ads}) => (
        <PlayerChrome title={movie.title} player={player} ads={ads} />
      )}
    </VegaAdsPlayer>
  );
};

const styles = StyleSheet.create({
  // Between the title and the controls of PlayerChrome.
  pauseAd: {top: 100, bottom: 220},
});
