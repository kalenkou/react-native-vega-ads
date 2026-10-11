import React, {useEffect} from 'react';
import {BackHandler, StyleSheet} from 'react-native';
import {AdIdRetriever} from '@amazon-devices/kepler-adid-retriever';
import {VegaAdsPlayer} from 'react-native-vega-ads';
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

/** The whole integration: one component, the app's own controls as children. */
export const PlayerScreen = ({movie, onClose, onEvent}: PlayerScreenProps) => {
  useBackToClose(onClose);
  return (
    <VegaAdsPlayer
      source={{uri: movie.uri}}
      ads={{vmapUrl: movie.vmapUrl}}
      pauseAdUrl={movie.pauseAdUrl}
      pauseAdStyle={styles.pauseAd}
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
