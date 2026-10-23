import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Image, Text, View} from 'react-native';
import {
  useAdAnnouncements,
  type VegaAds,
  type W3cVideoPlayer,
} from 'react-native-vega-ads';
import {useRemoteKeys} from '../remote';
import {colors, fonts, layoutStyles} from '../theme';
import {timecode} from '../time';
import type {CaptionSettings} from '../captionSettings';
import {AdLayer} from './AdLayer';
import {Timeline} from './Timeline';

const SEEK_SECONDS = 10;
const HIDE_AFTER_MS = 4000;
// The loading screen never stays longer, even if the player sends no event.
const LOADING_MAX_MS = 8000;

export interface PlayerChromeProps {
  title: string;
  player: W3cVideoPlayer | null;
  ads: VegaAds;
  /** Show why a break looks as it does, in the ad overlay. */
  showWhy?: boolean;
  /** The viewer's caption setting, for the ad captions. */
  captions?: CaptionSettings;
  /** Shown behind "Loading" until the first ad or movie frame. */
  poster?: string;
}

/** Position, duration and play state of the content player, from its events. */
function usePlayback(player: W3cVideoPlayer | null) {
  const [state, setState] = useState({
    position: 0,
    duration: 0,
    paused: false,
    started: false,
  });
  useEffect(() => {
    if (!player) {
      return undefined;
    }
    const update = (paused?: boolean) => () =>
      setState((previous) => ({
        position: player.currentTime,
        duration: player.duration > 0 ? player.duration : previous.duration,
        paused: paused ?? previous.paused,
        started: previous.started || player.currentTime > 0,
      }));
    const playing = () =>
      setState((previous) => ({...previous, started: true}));
    const listeners: Array<[string, () => void]> = [
      ['timeupdate', update()],
      ['loadedmetadata', update()],
      ['seeked', update()],
      ['pause', update(true)],
      ['play', update(false)],
      ['playing', playing],
      // For the device log: what the movie player did around each break.
      ...['play', 'playing', 'pause', 'seeked', 'ended', 'error'].map(
        (type): [string, () => void] => [
          type,
          () =>
            console.log(
              `[demo] content ${type} ${player.currentTime.toFixed(1)}`,
            ),
        ],
      ),
    ];
    listeners.forEach(([type, listener]) =>
      player.addEventListener(type, listener),
    );
    return () =>
      listeners.forEach(([type, listener]) =>
        player.removeEventListener(type, listener),
      );
  }, [player]);
  return state;
}

/**
 * The app's own controls over the movie: title, times and a timeline with the ad breaks.
 * Shown for a few seconds after a key press and while paused. During ads it draws the ad
 * overlay instead (AdLayer), with the library's VoiceView announcements.
 * Left/right seek 10 s (a seek over a break plays that break first: no free pass).
 */
export const PlayerChrome = ({
  title,
  player,
  ads,
  showWhy = false,
  captions,
  poster,
}: PlayerChromeProps) => {
  const {position, duration, paused, started} = usePlayback(player);
  // Until the first ad or movie frame the screen is black: show the poster and "Loading"
  // instead of "Playing 00:00:00" over nothing.
  const [loadingOver, setLoadingOver] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLoadingOver(true), LOADING_MAX_MS);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (ads.playing || started) {
      setLoadingOver(true);
    }
  }, [ads.playing, started]);
  useAdAnnouncements(ads.ui);
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
    }
    hideTimer.current = setTimeout(() => setVisible(false), HIDE_AFTER_MS);
  }, []);
  useEffect(() => {
    show();
    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    };
  }, [show]);

  // For the device log next to the IAB events: when the "Ad in N" countdown runs.
  const nextBreakIn = ads.timeline.nextBreakIn;
  useEffect(() => {
    if (nextBreakIn !== null) {
      console.log(`[ads] countdown ${nextBreakIn}`);
    }
  }, [nextBreakIn]);

  useRemoteKeys((key) => {
    if (ads.playing || !player) {
      return; // during ads the remote belongs to the ad overlay and media controls
    }
    if (key === 'left' || key === 'right') {
      const step = key === 'left' ? -SEEK_SECONDS : SEEK_SECONDS;
      const end = duration > 0 ? duration - 1 : Number.MAX_SAFE_INTEGER;
      player.currentTime = Math.min(
        end,
        Math.max(0, player.currentTime + step),
      );
      show();
    } else if (key === 'select') {
      if (paused) {
        void player.play();
      } else {
        player.pause();
      }
      show();
    } else if (key === 'up' || key === 'down') {
      show();
    }
  });

  if (ads.playing) {
    return (
      <View style={styles.root} pointerEvents="box-none">
        <AdLayer
          title={title}
          ads={ads}
          position={position}
          duration={duration}
          showWhy={showWhy}
          captions={captions}
        />
      </View>
    );
  }
  if (!loadingOver) {
    return (
      <View style={styles.loading} pointerEvents="none" testID="player-loading">
        {poster && (
          <Image source={{uri: poster}} style={styles.poster} blurRadius={2} />
        )}
        <View style={styles.scrim} />
        <Text style={styles.loadingTitle}>{title}</Text>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </View>
    );
  }
  if (!(visible || paused)) {
    return null;
  }
  return (
    <View style={styles.root} pointerEvents="none" testID="player-chrome">
      <Text style={styles.title}>{title}</Text>
      <View style={styles.bottom}>
        <Text style={styles.state}>{paused ? 'Paused' : 'Playing'}</Text>
        <Timeline
          position={position}
          duration={duration}
          marks={ads.timeline.marks}
        />
        <View style={styles.times}>
          <Text style={styles.time}>{timecode(Math.floor(position))}</Text>
          <Text style={styles.hint}>
            ◀ ▶ 10 s · OK play/pause · orange marks: ad breaks
          </Text>
          <Text style={styles.time}>{timecode(Math.floor(duration))}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = layoutStyles({
  root: {position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 5},
  loading: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    justifyContent: 'center',
    paddingLeft: 96,
    backgroundColor: colors.background,
  },
  poster: {position: 'absolute', top: 0, bottom: 0, left: 0, right: 0},
  scrim: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.scrim,
  },
  loadingTitle: {color: colors.text, fontFamily: fonts.display, fontSize: 64},
  loadingRow: {flexDirection: 'row', alignItems: 'center', marginTop: 24},
  loadingText: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 30,
    marginLeft: 20,
  },
  title: {
    position: 'absolute',
    top: 54,
    left: 96,
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 48,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 96,
    paddingTop: 28,
    paddingBottom: 40,
    backgroundColor: colors.scrim,
  },
  state: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 24,
    marginBottom: 18,
    textTransform: 'uppercase',
  },
  times: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 18},
  time: {color: colors.text, fontFamily: fonts.mono, fontSize: 24},
  hint: {color: colors.muted, fontFamily: fonts.body, fontSize: 22},
});
