import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  BackHandler,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {VideoPlayer} from '@amazon-devices/react-native-w3cmedia';
import {useEvent, useVideoPlayer, VideoView} from 'react-native-video';
import {
  rnvPlayerPort,
  VegaAdsPlayer,
  type BreakMark,
  type W3cVideoPlayer,
} from 'react-native-vega-ads';
import Slider from '@react-native-community/slider';
import BootSplash from 'react-native-bootsplash';
import {MEDIA_BASE, MUTED} from './media.local';

// One Fire TV app built from open-source parts ported to Vega:
// react-native-video v7 (#5171) plays the movie, react-native-vega-ads plays the ads,
// the slider (#839) seeks with the ad breaks marked on it, and bootsplash (#808) keeps
// the launch screen until the catalog is ready.
// Sizes are in dp: React Native 0.83 on Vega lays out on a 960x540 canvas.

const MOVIES = {
  tos: {
    title: 'Tears of Steel',
    uri: `${MEDIA_BASE}tears_of_steel_720p.mp4`,
    vmapUrl: `${MEDIA_BASE}vmap/movie.xml`,
    poster: `${MEDIA_BASE}poster.jpg`,
    info: '2012 · 12 min · sci-fi',
  },
  sintel: {
    title: 'Sintel',
    uri: `${MEDIA_BASE}sintel_720p.mp4`,
    vmapUrl: `${MEDIA_BASE}vmap/sintel.xml`,
    poster: `${MEDIA_BASE}poster_sintel.jpg`,
    info: '2010 · 15 min · fantasy',
  },
} as const;
type MovieId = keyof typeof MOVIES;

const PARTS = [
  'react-native-video #5171',
  'vega-ads',
  'slider #839',
  'bootsplash #808',
];

/** The launch screen stays at most this long when the posters do not load. */
const SPLASH_MAX_MS = 3000;

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(
    2,
    '0',
  )}`;

/** Ad players that stay muted: set again on every play, in case a new source resets it. */
const createMutedAdPlayer = (): W3cVideoPlayer => {
  const player = new VideoPlayer() as unknown as W3cVideoPlayer;
  player.muted = true;
  for (const event of ['loadedmetadata', 'canplay', 'play', 'playing']) {
    player.addEventListener(event, () => {
      player.muted = true;
    });
  }
  return player;
};

function PosterCard({
  id,
  first,
  onPlay,
  onPosterDone,
}: {
  id: MovieId;
  first: boolean;
  onPlay: (id: MovieId) => void;
  onPosterDone: () => void;
}) {
  const movie = MOVIES[id];
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      hasTVPreferredFocus={first}
      onPress={() => onPlay(id)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityLabel={`${movie.title}, ${movie.info}. Plays with ads.`}
      style={[styles.card, focused && styles.cardFocused]}>
      <Image
        source={{uri: movie.poster}}
        style={styles.poster}
        resizeMode="cover"
        onLoad={onPosterDone}
        onError={onPosterDone}
      />
      <Text style={styles.movieTitle}>{movie.title}</Text>
      <Text style={styles.movieInfo}>{movie.info}</Text>
    </Pressable>
  );
}

function Home({
  focus,
  onPlay,
  onReady,
}: {
  /** The card that gets the focus: the movie the viewer came back from, or the first one. */
  focus: MovieId;
  onPlay: (id: MovieId) => void;
  onReady: () => void;
}) {
  return (
    <View style={styles.home}>
      <Text style={styles.title}>Vega streaming kit</Text>
      <Text style={styles.subtitle}>
        One Fire TV app, made of open-source parts ported to Vega
      </Text>
      <View style={styles.chips}>
        {PARTS.map((name) => (
          <View key={name} style={styles.chip}>
            <Text style={styles.chipText}>{name}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.label}>Pick a movie</Text>
      <View style={styles.cards}>
        <PosterCard
          id="tos"
          first={focus === 'tos'}
          onPlay={onPlay}
          onPosterDone={onReady}
        />
        <PosterCard
          id="sintel"
          first={focus === 'sintel'}
          onPlay={onPlay}
          onPosterDone={onReady}
        />
      </View>
      <Text style={styles.credit}>
        Tears of Steel and Sintel: © Blender Foundation, CC BY 3.0
      </Text>
    </View>
  );
}

/** The slider's thumb in dp. With focus it is 4 dp wider: its centre runs from half that to the width minus half. */
const THUMB = 16;
const THUMB_HALF = (THUMB + 4) / 2;

/**
 * The slider with the mid-rolls of vega-ads marked on it, like a streaming app's seek bar.
 * Vega draws the focused slider over the views next to it, so the bar draws the track and
 * the marks itself, under the slider, and the slider shows only its thumb. Marks ahead are
 * yellow, played ones grey: both show on either part of the track.
 */
function SeekBar({
  time,
  duration,
  marks,
  onSlidingStart,
  onSlidingEnd,
  onSeek,
}: {
  time: number;
  duration: number;
  marks: readonly BreakMark[];
  onSlidingStart: () => void;
  onSlidingEnd: () => void;
  onSeek: (seconds: number) => void;
}) {
  // A bar that goes away during a key hold (a break starts) ends the slide too.
  useEffect(() => onSlidingEnd, [onSlidingEnd]);
  const [width, setWidth] = useState(0);
  // Where the thumb is while it moves: the label and the played part follow it.
  const [moving, setMoving] = useState<number | null>(null);
  const shown = moving ?? time;
  const share = duration > 0 ? Math.min(1, Math.max(0, shown / duration)) : 0;
  const played = THUMB_HALF + share * Math.max(0, width - 2 * THUMB_HALF);
  return (
    <View style={styles.bar}>
      <Text style={styles.time}>{clock(shown)}</Text>
      <View
        style={styles.seek}
        onLayout={({nativeEvent}) => setWidth(nativeEvent.layout.width)}>
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.played, {width: played}]} />
        </View>
        <View style={styles.marks} pointerEvents="none">
          {marks.map((mark) => (
            <View
              key={mark.id}
              style={[
                styles.mark,
                {left: `${(mark.time / duration) * 100}%`},
                mark.done && styles.markDone,
              ]}
            />
          ))}
        </View>
        <Slider
          hasTVPreferredFocus
          style={styles.slider}
          minimumValue={0}
          maximumValue={duration}
          step={10}
          value={time}
          accessibilityLabel="Seek"
          accessibilityHint={
            marks.length > 0
              ? `Ad breaks at ${marks.map((mark) => clock(mark.time)).join(', ')}`
              : undefined
          }
          minimumTrackTintColor="transparent"
          maximumTrackTintColor="transparent"
          thumbTintColor="#ffffff"
          thumbSize={THUMB}
          onSlidingStart={onSlidingStart}
          onValueChange={setMoving}
          onSlidingComplete={(seconds) => {
            setMoving(null);
            onSeek(seconds);
          }}
        />
      </View>
      <Text style={styles.time}>{clock(duration)}</Text>
    </View>
  );
}

function Watch({movie, onClose}: {movie: MovieId; onClose: () => void}) {
  const {uri, vmapUrl} = MOVIES[movie];
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [started, setStarted] = useState(false);
  // While the slider moves, the playing time must not pull it back.
  const sliding = useRef(false);
  // After a seek the player still reports the old time for a moment: wait for the new one.
  const seekingTo = useRef<{seconds: number; since: number} | null>(null);
  const endSliding = useCallback(() => {
    sliding.current = false;
  }, []);
  // No play() here: the ads start the movie after the pre-roll.
  const player = useVideoPlayer({uri}, (p) => {
    p.muted = MUTED;
    // The remote's play/pause and "Alexa, pause" reach the movie. The ad players take this
    // focus during a break, and the port gives it back after.
    p.showNotificationControls = true;
  });
  const content = useMemo(
    () =>
      rnvPlayerPort(player, {
        takeMediaControlFocus: async () => {
          player.showNotificationControls = true;
        },
      }),
    [player],
  );
  const ads = useMemo(() => ({vmapUrl}), [vmapUrl]);

  useEvent(player, 'onPlaybackStateChange', () => {
    if (MUTED) {
      player.muted = true;
    }
  });
  useEvent(player, 'onLoad', (data) => setDuration(data.duration));
  useEvent(player, 'onProgress', ({currentTime}) => {
    const seek = seekingTo.current;
    if (
      seek &&
      Math.abs(currentTime - seek.seconds) > 2 &&
      Date.now() - seek.since < 3000
    ) {
      return;
    }
    seekingTo.current = null;
    if (!sliding.current) {
      setTime(currentTime);
    }
    if (currentTime > 0) {
      setStarted(true);
    }
  });

  return (
    <View style={styles.root}>
      <VegaAdsPlayer
        player={content}
        ads={ads}
        createVideoPlayer={MUTED ? createMutedAdPlayer : undefined}
        onEnd={onClose}>
        {({ads: state}) => (
          <>
            <VideoView player={player} style={StyleSheet.absoluteFill} />
            {/* The seek bar shows once the movie has started, and hides during ads. */}
            {started && !state.playing && duration > 0 ? (
              <SeekBar
                time={time}
                duration={duration}
                marks={state.timeline.marks}
                onSlidingStart={() => {
                  sliding.current = true;
                }}
                onSlidingEnd={endSliding}
                onSeek={(seconds) => {
                  sliding.current = false;
                  seekingTo.current = {seconds, since: Date.now()};
                  setTime(seconds);
                  player.seekTo(seconds);
                }}
              />
            ) : null}
          </>
        )}
      </VegaAdsPlayer>
    </View>
  );
}

export function KitApp() {
  const [movie, setMovie] = useState<MovieId | null>(null);
  // Back from a movie, the focus returns to its card.
  const [last, setLast] = useState<MovieId>('tos');
  const play = useCallback((id: MovieId) => {
    setLast(id);
    setMovie(id);
  }, []);
  const [catalogReady, setCatalogReady] = useState(false);

  // The catalog is ready when the first poster has loaded (or failed): hide the launch screen.
  useEffect(() => {
    const fallback = setTimeout(() => setCatalogReady(true), SPLASH_MAX_MS);
    return () => clearTimeout(fallback);
  }, []);
  useEffect(() => {
    if (catalogReady) {
      BootSplash.hide({fade: true});
    }
  }, [catalogReady]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (movie === null) {
        return false;
      }
      setMovie(null);
      return true;
    });
    return () => sub.remove();
  }, [movie]);

  return movie !== null ? (
    <Watch movie={movie} onClose={() => setMovie(null)} />
  ) : (
    <Home focus={last} onPlay={play} onReady={() => setCatalogReady(true)} />
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: 'black'},
  home: {
    flex: 1,
    backgroundColor: '#0b0d12',
    paddingHorizontal: 64,
    paddingTop: 40,
  },
  title: {color: '#eef1f6', fontSize: 40, fontWeight: 'bold'},
  subtitle: {color: '#9aa1ad', fontSize: 19, marginTop: 4},
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 18,
    marginBottom: 14,
  },
  chip: {
    justifyContent: 'center',
    height: 30,
    borderWidth: 1,
    borderColor: '#f28c38',
    borderRadius: 15,
    paddingHorizontal: 12,
    marginRight: 10,
    marginBottom: 8,
  },
  chipText: {color: '#f28c38', fontSize: 15},
  label: {color: '#9aa1ad', fontSize: 17, marginBottom: 10},
  cards: {flexDirection: 'row'},
  card: {
    width: 300,
    marginRight: 32,
    padding: 6,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  cardFocused: {borderColor: '#7fbcff', backgroundColor: '#161b25'},
  poster: {
    width: '100%',
    aspectRatio: 1280 / 534,
    borderRadius: 6,
    backgroundColor: '#1a1e27',
  },
  movieTitle: {
    color: '#eef1f6',
    fontSize: 21,
    fontWeight: 'bold',
    marginTop: 8,
  },
  movieInfo: {color: '#9aa1ad', fontSize: 15, marginTop: 2},
  credit: {
    position: 'absolute',
    left: 64,
    bottom: 24,
    color: '#6b7280',
    fontSize: 13,
  },
  bar: {
    position: 'absolute',
    left: 48,
    right: 48,
    bottom: 32,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(11,13,18,0.75)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  time: {color: '#eef1f6', fontSize: 16, width: 56, textAlign: 'center'},
  seek: {flex: 1, height: 40, justifyContent: 'center'},
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 18,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3a404c',
  },
  played: {height: 4, borderRadius: 2, backgroundColor: '#f28c38'},
  marks: {
    position: 'absolute',
    left: THUMB_HALF,
    right: THUMB_HALF,
    top: 0,
    bottom: 0,
  },
  mark: {
    position: 'absolute',
    top: 13,
    width: 4,
    height: 14,
    marginLeft: -2,
    borderRadius: 2,
    backgroundColor: '#ffd23f',
  },
  markDone: {backgroundColor: '#c3c8d1'},
  slider: {height: 40},
});
