import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {VideoPlayer} from '@amazon-devices/react-native-w3cmedia';
import {AdOverlay, DualSurfaceView, useVegaAds} from '@vega-ads/vega';
import {VMAP_OPTIMIZED_POD_TAG} from './spike/ads';
import {log, subscribe} from './spike/log';
import {APP_HANDLES_PLAYPAUSE, DEMO_MEDIA_BASE} from './spikeConfig';

// Kepler's react-native exports useTVEventHandler; the RN 0.72 typings do not.
const {useTVEventHandler} = require('react-native') as {
  useTVEventHandler: (
    handler: (event: {eventType: string; eventKeyAction?: number}) => void,
  ) => void;
};

const CONTENT_URL = DEMO_MEDIA_BASE
  ? `${DEMO_MEDIA_BASE}tears_of_steel_720p.mp4`
  : 'https://archive.org/download/BigBuckBunny_328/BigBuckBunny_512kb.mp4';

/** The library as an app uses it: one hook, two components. */
export const HookDemo = () => {
  const [player, setPlayer] = useState<VideoPlayer | null>(null);
  const [vmapUrl] = useState(() =>
    DEMO_MEDIA_BASE
      ? `${DEMO_MEDIA_BASE}vmap/movie.xml`
      : `${VMAP_OPTIMIZED_POD_TAG}${Date.now()}`,
  );
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => subscribe((all) => setLines(all.slice(0, 8))), []);

  useEffect(() => {
    const created = new VideoPlayer();
    let alive = true;
    void created.initialize().then(() => {
      if (!alive) {
        return;
      }
      created.autoplay = false;
      created.src = CONTENT_URL;
      setPlayer(created);
    });
    return () => {
      alive = false;
      void created.deinitialize().catch(() => undefined);
    };
  }, []);

  const ads = useVegaAds({
    source: {vmapUrl},
    contentPlayer: player,
    mediaControls: !APP_HANDLES_PLAYPAUSE,
    onEvent: (name) => log(`hook event: ${name}`),
  });

  // What an app's own remote handler does: during an ad the ad, otherwise the content.
  useTVEventHandler((event) => {
    if (event.eventType === 'playpause') {
      log(`raw key playpause action=${event.eventKeyAction}`);
    }
    if (!APP_HANDLES_PLAYPAUSE || event.eventType !== 'playpause' || event.eventKeyAction !== 0) {
      return;
    }
    if (ads.playing) {
      log(`key playpause -> ad (${ads.togglePause()})`);
    } else if (player) {
      log(`key playpause -> content (${player.paused ? 'play' : 'pause'})`);
      if (player.paused) {
        void player.play();
      } else {
        player.pause();
      }
    }
  });

  return (
    <View style={styles.root}>
      <DualSurfaceView surfaces={ads.surfaces} contentPlayer={player} />
      <AdOverlay ui={ads.ui} onSkip={ads.skip} />
      <View style={styles.log}>
        <Text style={styles.line}>
          {`hook: ${ads.snapshot.state}${ads.ui.visible ? ` · ${ads.ui.label}` : ''}` +
            ` · keys: ${APP_HANDLES_PLAYPAUSE ? 'app' : 'media controls'}`}
        </Text>
        {lines.map((line, index) => (
          <Text key={`${index}-${line}`} style={styles.line}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  log: {position: 'absolute', right: 20, bottom: 20, zIndex: 20, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8},
  line: {color: '#9f9', fontSize: 16},
});
