import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';
import {
  VideoPlayer,
  KeplerVideoSurfaceView,
} from '@amazon-devices/react-native-w3cmedia';
import {useKeplerAppStateManager} from '@amazon-devices/react-native-kepler';
import {log, subscribe} from './spike/log';
import {installImagePolyfill, reportRuntime} from './spike/runtime';
import {checkVmap, loadAd, LoadedAd} from './spike/ads';

const CONTENT_URL =
  'https://archive.org/download/BigBuckBunny_328/BigBuckBunny_512kb.mp4';
const FIRST_BREAK_SEC = 10;
const BREAK_INTERVAL_SEC = 60;
const OFFSCREEN_LEFT = -Dimensions.get('window').width * 1.2;

export const App = () => {
  const [lines, setLines] = useState<string[]>([]);
  const [adVisible, setAdVisible] = useState(false);
  const mainSurface = useRef<string | null>(null);
  const adSurface = useRef<string | null>(null);
  const mainPlayer = useRef<VideoPlayer | null>(null);
  const adPlayer = useRef<VideoPlayer | null>(null);
  const loadedAd = useRef<LoadedAd | null>(null);
  const adReady = useRef(false);
  const inBreak = useRef(false);
  const nextBreakSec = useRef(FIRST_BREAK_SEC);
  const breaksLeft = useRef(1);
  const savedPosition = useRef(0);
  const switchStartedAt = useRef(0);
  const impressionSent = useRef(false);
  const checkResumeDrift = useRef(false);
  const componentInstance = useKeplerAppStateManager().getComponentInstance();

  // Gate: remote play/pause and "Alexa, pause" must reach the player the viewer sees.
  const focusMediaControls = useCallback(
    (player: VideoPlayer | null, label: string) => {
      if (!player) {
        return;
      }
      const started = Date.now();
      player
        .setMediaControlFocus(componentInstance)
        .then(() =>
          log(`media controls -> ${label} in ${Date.now() - started} ms`),
        )
        .catch((error: unknown) =>
          log(`media controls -> ${label} failed: ${String(error)}`),
        );
    },
    [componentInstance],
  );

  useEffect(() => subscribe(setLines), []);
  useEffect(() => {
    reportRuntime();
    installImagePolyfill();
    void checkVmap();
    return () => {
      void adPlayer.current?.deinitialize().catch(() => undefined);
      void mainPlayer.current?.deinitialize().catch(() => undefined);
    };
  }, []);

  // Assigned below; declared first so the ad player listeners can call it.
  const resumeRef = useRef<(reason: string) => Promise<void>>(
    async () => undefined,
  );

  const prepareAd = useCallback(async () => {
    adReady.current = false;
    impressionSent.current = false;
    loadedAd.current = await loadAd();
    const ad = loadedAd.current;
    if (!ad || !adSurface.current) {
      return;
    }
    const player = new VideoPlayer();
    await player.initialize();
    player.setSurfaceHandle(adSurface.current);
    player.autoplay = false;
    player.addEventListener('canplay', () => {
      adReady.current = true;
      log('ad player: canplay (pre-buffered)');
    });
    player.addEventListener('playing', () => {
      if (!impressionSent.current) {
        impressionSent.current = true;
        log(
          `SWITCH content->ad: ${
            Date.now() - switchStartedAt.current
          } ms (pause -> ad playing)`,
        );
        ad.tracker.trackImpression();
        ad.tracker.setDuration(ad.durationSec);
      }
    });
    player.addEventListener('timeupdate', () => {
      ad.tracker.setProgress(player.currentTime);
    });
    player.addEventListener('pause', () => log('ad: pause event'));
    player.addEventListener('ended', () => {
      ad.tracker.complete();
      void resumeRef.current('ended');
    });
    player.addEventListener('error', () => {
      log(`ad player error: ${player.error?.code} ${player.error?.message}`);
      ad.tracker.error({ERRORCODE: '405'});
      void resumeRef.current('error');
    });
    player.src = ad.mediaUrl;
    adPlayer.current = player;
  }, []);

  resumeRef.current = async (reason: string) => {
    const resumedAt = Date.now();
    setAdVisible(false);
    const main = mainPlayer.current;
    if (main) {
      main.currentTime = savedPosition.current;
      checkResumeDrift.current = true;
      void main.play();
      focusMediaControls(main, 'content');
    }
    log(`resume (${reason}) at ${savedPosition.current.toFixed(2)} s`);
    await adPlayer.current?.deinitialize().catch(() => undefined);
    adPlayer.current = null;
    inBreak.current = false;
    log(`ad player released in ${Date.now() - resumedAt} ms`);
    if (breaksLeft.current > 0) {
      nextBreakSec.current = savedPosition.current + BREAK_INTERVAL_SEC;
      void prepareAd();
    }
  };

  const startBreak = useCallback(() => {
    const main = mainPlayer.current;
    const ad = adPlayer.current;
    if (!main) {
      return;
    }
    breaksLeft.current -= 1;
    savedPosition.current = main.currentTime;
    if (!ad || !adReady.current) {
      log('break skipped: ad not ready');
      nextBreakSec.current = main.currentTime + BREAK_INTERVAL_SEC;
      return;
    }
    inBreak.current = true;
    switchStartedAt.current = Date.now();
    main.pause();
    setAdVisible(true);
    void ad.play();
    focusMediaControls(ad, 'ad');
  }, [focusMediaControls]);

  const run = useCallback(
    async (breaks: number) => {
      if (!mainSurface.current || !adSurface.current) {
        log('surfaces not ready yet');
        return;
      }
      await adPlayer.current?.deinitialize().catch(() => undefined);
      await mainPlayer.current?.deinitialize().catch(() => undefined);
      breaksLeft.current = breaks;
      nextBreakSec.current = FIRST_BREAK_SEC;
      inBreak.current = false;
      log(`run: ${breaks} break(s)`);

      const main = new VideoPlayer();
      await main.initialize();
      main.setSurfaceHandle(mainSurface.current);
      main.autoplay = true;
      main.addEventListener('timeupdate', () => {
        if (
          !inBreak.current &&
          breaksLeft.current > 0 &&
          main.currentTime >= nextBreakSec.current
        ) {
          startBreak();
        }
      });
      main.addEventListener('playing', () => {
        if (checkResumeDrift.current) {
          checkResumeDrift.current = false;
          const drift = main.currentTime - savedPosition.current;
          log(`RESUME drift: ${drift.toFixed(2)} s`);
        }
      });
      main.addEventListener('pause', () =>
        log(`content: pause event at ${main.currentTime.toFixed(2)} s`),
      );
      main.addEventListener('error', () =>
        log(`content error: ${main.error?.code} ${main.error?.message}`),
      );
      main.src = CONTENT_URL;
      mainPlayer.current = main;
      focusMediaControls(main, 'content');
      void prepareAd();
    },
    [prepareAd, startBreak, focusMediaControls],
  );

  return (
    <View style={styles.root}>
      <View style={[styles.surface, styles.mainSurface]}>
        <KeplerVideoSurfaceView
          scalingmode="fit"
          onSurfaceViewCreated={(handle: string) => {
            mainSurface.current = handle;
            log('main surface created');
          }}
          onSurfaceViewDestroyed={() => {
            mainSurface.current = null;
          }}
        />
      </View>
      <View
        style={[
          styles.surface,
          styles.adSurface,
          {left: adVisible ? 0 : OFFSCREEN_LEFT},
        ]}>
        <KeplerVideoSurfaceView
          scalingmode="fit"
          onSurfaceViewCreated={(handle: string) => {
            adSurface.current = handle;
            log('ad surface created');
          }}
          onSurfaceViewDestroyed={() => {
            adSurface.current = null;
          }}
        />
      </View>
      <View style={styles.panel}>
        <View style={styles.buttons}>
          <TouchableOpacity
            hasTVPreferredFocus
            style={styles.button}
            onPress={() => void run(1)}>
            <Text style={styles.buttonText}>1 break</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => void run(10)}>
            <Text style={styles.buttonText}>10 breaks (memory)</Text>
          </TouchableOpacity>
        </View>
        {lines.map((line, index) => (
          <Text key={`${index}-${line}`} style={styles.line}>
            {line}
          </Text>
        ))}
      </View>
      {adVisible && <Text style={styles.adBadge}>Ad</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  surface: {position: 'absolute', top: 0, bottom: 0, right: 0},
  mainSurface: {left: 0, zIndex: 1},
  adSurface: {zIndex: 2},
  panel: {
    position: 'absolute',
    right: 20,
    top: 20,
    width: 760,
    zIndex: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 12,
  },
  buttons: {flexDirection: 'row', marginBottom: 8},
  button: {
    backgroundColor: '#333',
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginRight: 12,
  },
  buttonText: {color: '#fff', fontSize: 22},
  line: {color: '#9f9', fontSize: 15},
  adBadge: {
    position: 'absolute',
    left: 40,
    top: 40,
    zIndex: 4,
    color: '#ff0',
    fontSize: 30,
  },
});
