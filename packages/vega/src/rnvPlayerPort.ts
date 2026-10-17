import type { PlayerEventName, PlayerPort } from 'react-native-ads-core';

interface Subscription {
  remove(): void;
}

/**
 * The part of a react-native-video v7 `VideoPlayer` that vega-ads uses. Described by shape, so
 * this package does not depend on react-native-video.
 */
export interface RnvPlayerLike {
  initialize(): Promise<void>;
  play(): void;
  pause(): void;
  seekTo(time: number): void;
  readonly currentTime: number;
  readonly duration: number;
  muted: boolean;
  replaceSourceAsync(source: { uri: string } | null): Promise<void>;
  // `any`: the real method is generic over react-native-video's event map; this shape accepts it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addEventListener(event: string, listener: (...args: any[]) => void): Subscription;
}

export interface RnvPlayerPortOptions {
  /**
   * Gives remote and voice play/pause back to the content after a break. Pass it when your
   * Vega backend of react-native-video handles media controls; otherwise nothing is done.
   */
  takeMediaControlFocus?: () => Promise<void>;
}

/** Which react-native-video event stands for each player event vega-ads listens to. */
const EVENTS: Record<PlayerEventName, { event: string; when?: (payload: unknown) => boolean }> = {
  timeupdate: { event: 'onProgress' },
  ended: { event: 'onEnd' },
  playing: { event: 'onPlaybackStateChange', when: (data) => (data as { isPlaying?: boolean })?.isPlaying === true },
  pause: { event: 'onPlaybackStateChange', when: (data) => (data as { isPlaying?: boolean })?.isPlaying === false },
  waiting: { event: 'onBuffer', when: (buffering) => buffering === true },
  canplay: { event: 'onStatusChange', when: (status) => status === 'readyToPlay' },
  error: { event: 'onError' },
};

/**
 * The content player for vega-ads from a react-native-video v7 player, through its public API:
 *
 * ```tsx
 * const player = useVideoPlayer({ uri }); // do not call play() in setup: vega-ads starts it
 * const content = useMemo(() => rnvPlayerPort(player), [player]);
 * const ads = useVegaAds({ source: { vmapUrl }, contentPlayer: content });
 * <VideoView player={player} /> <AdSurfaceLayers surfaces={ads.surfaces} /> <AdOverlay ui={ads.ui} onSkip={ads.skip} />
 * ```
 *
 * `<VideoView>` keeps the content surface; the adapter never moves it. Hide your controls while
 * `ads.playing`: react-native-video reports `readyToPlay` during the pre-roll.
 */
export function rnvPlayerPort(player: RnvPlayerLike, options: RnvPlayerPortOptions = {}): PlayerPort {
  const subscriptions = new Set<Subscription>();
  const listen = (event: string, listener: (payload: unknown) => void): Subscription => {
    const subscription = player.addEventListener(event, listener);
    subscriptions.add(subscription);
    return subscription;
  };

  return {
    initialize: () => player.initialize(),
    attachSurface: () => undefined,
    detachSurface: () => undefined,
    setAutoplay: () => undefined,
    setSrc: (url) => void player.replaceSourceAsync({ uri: url }),
    setMuted: (muted) => {
      player.muted = muted;
    },
    play: async () => player.play(),
    pause: () => player.pause(),
    getCurrentTime: () => player.currentTime,
    setCurrentTime: (seconds) => player.seekTo(seconds),
    getDuration: () => (Number.isFinite(player.duration) ? player.duration : 0),
    takeMediaControlFocus: options.takeMediaControlFocus ?? (() => Promise.resolve()),
    on(name, listener) {
      const { event, when } = EVENTS[name];
      const subscription = listen(event, (payload) => {
        if (!when || when(payload)) {
          listener();
        }
      });
      return () => {
        subscription.remove();
        subscriptions.delete(subscription);
      };
    },
    // The app's useVideoPlayer() owns the player and releases it; only the listeners go here.
    deinitialize: async () => {
      subscriptions.forEach((subscription) => subscription.remove());
      subscriptions.clear();
    },
  };
}
