import React, {useEffect} from 'react';
import {BackHandler} from 'react-native';
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

/** Back outside ads closes the player; during ads VegaAdsPlayer returns to the movie first. */
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
      adId={AdIdRetriever}
      onEnd={onClose}
      onEvent={onEvent}>
      {({player, ads}) => (
        <PlayerChrome title={movie.title} player={player} ads={ads} />
      )}
    </VegaAdsPlayer>
  );
};
