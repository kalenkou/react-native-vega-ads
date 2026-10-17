import React, {useEffect, useState} from 'react';
import {BackHandler, StyleSheet, Text} from 'react-native';
import {AdIdRetriever} from '@amazon-devices/kepler-adid-retriever';
import AsyncStorage from '@amazon-devices/react-native-async-storage__async-storage';
import {VideoPlayer} from '@amazon-devices/react-native-w3cmedia';
import {
  VegaAdsPlayer,
  type RepeatOptions,
  type W3cVideoPlayer,
} from 'react-native-vega-ads';
import {adsMode} from '../adsMode';
import {systemCaptionSettings, useCaptionSettings} from '../captionSettings';
import type {Movie} from '../catalog';
import {PlayerChrome} from '../components/PlayerChrome';
import {MUTED} from '../media.local';
import {colors} from '../theme';

/** Content and ad players that stay muted: set again on every play, in case a new source resets it. */
const createMutedPlayer = (): W3cVideoPlayer => {
  const player = new VideoPlayer() as unknown as W3cVideoPlayer;
  player.muted = true;
  // Mute again at every step before sound starts: a test app once saw play() with muted=false.
  for (const event of ['loadedmetadata', 'canplay', 'play', 'playing']) {
    player.addEventListener(event, () => {
      player.muted = true;
    });
  }
  return player;
};

export interface PlayerScreenProps {
  movie: Movie;
  /** Ads as usual, to compare with (the "Compare" button). */
  classic?: boolean;
  onClose: () => void;
  /** IAB events and errors, for the on-screen log in the demo video. */
  onEvent?: (name: string) => void;
}

/**
 * Back closes the player, also during an ad (VegaAdsPlayer's default `backDuringAd: 'app'`, so an
 * ad without Skip cannot be skipped with Back). On a pause ad, Back closes the ad first.
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
  const [captionSource] = useState(systemCaptionSettings);
  const captions = useCaptionSettings(captionSource);
  // For the device log next to the IAB events: the viewer's caption setting.
  useEffect(() => {
    console.log(
      `[captions] ${captions.enabled ? 'on' : 'off'} ${captions.fontSize}`,
    );
  }, [captions.enabled, captions.fontSize]);
  return (
    <VegaAdsPlayer
      source={{uri: movie.uri}}
      ads={mode.ads}
      pauseAdUrl={mode.pauseAdUrl}
      pauseAdStyle={styles.pauseAd}
      avoidRepeats={mode.avoidRepeats}
      contentLoudness={mode.contentLoudness}
      captionLanguage="en"
      adId={AdIdRetriever}
      showWhy={mode.showWhy}
      countdown={mode.countdown}
      onEnd={onClose}
      onEvent={onEvent}
      createVideoPlayer={MUTED ? createMutedPlayer : undefined}
      // The ad overlay is the demo's own (PlayerChrome → AdLayer).
      renderOverlay={() => null}>
      {({player, ads}) => (
        <>
          <PlayerChrome
            title={movie.title}
            player={player}
            ads={ads}
            showWhy={mode.showWhy}
            captions={captions}
          />
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
