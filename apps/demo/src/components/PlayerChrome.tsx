import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {VegaAds, W3cVideoPlayer} from 'react-native-vega-ads';
import {useRemoteKeys} from '../remote';
import {colors} from '../theme';
import {formatTime} from '../time';
import {Timeline} from './Timeline';

const SEEK_SECONDS = 10;
const HIDE_AFTER_MS = 4000;

export interface PlayerChromeProps {
  title: string;
  player: W3cVideoPlayer | null;
  ads: VegaAds;
}

/** Position, duration and play state of the content player, from its events. */
function usePlayback(player: W3cVideoPlayer | null) {
  const [state, setState] = useState({position: 0, duration: 0, paused: false});
  useEffect(() => {
    if (!player) {
      return undefined;
    }
    const update = (paused?: boolean) => () =>
      setState((previous) => ({
        position: player.currentTime,
        duration: player.duration > 0 ? player.duration : previous.duration,
        paused: paused ?? previous.paused,
      }));
    const listeners: Array<[string, () => void]> = [
      ['timeupdate', update()],
      ['loadedmetadata', update()],
      ['seeked', update()],
      ['pause', update(true)],
      ['play', update(false)],
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
 * Shown for a few seconds after a key press and while paused; never during ads.
 * Left/right seek 10 s (a seek over a break plays that break first: no free pass).
 */
export const PlayerChrome = ({title, player, ads}: PlayerChromeProps) => {
  const {position, duration, paused} = usePlayback(player);
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

  if (ads.playing || !(visible || paused)) {
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
          <Text style={styles.time}>{formatTime(position)}</Text>
          <Text style={styles.hint}>
            ◀ ▶ 10 s · OK play/pause · yellow marks: ad breaks
          </Text>
          <Text style={styles.time}>{formatTime(duration)}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 5},
  title: {
    position: 'absolute',
    top: 40,
    left: 64,
    color: colors.text,
    fontSize: 32,
    fontWeight: '600',
  },
  bottom: {
    position: 'absolute',
    left: 64,
    right: 64,
    bottom: 48,
    padding: 24,
    borderRadius: 12,
    backgroundColor: colors.scrim,
  },
  state: {color: colors.muted, fontSize: 22, marginBottom: 16},
  times: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 16},
  time: {color: colors.text, fontSize: 24},
  hint: {color: colors.muted, fontSize: 20},
});
