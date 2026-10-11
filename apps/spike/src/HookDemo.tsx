import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {VideoPlayer} from '@amazon-devices/react-native-w3cmedia';
import {AdOverlay, DualSurfaceView, useVegaAds} from '@vega-ads/vega';
import {VMAP_OPTIMIZED_POD_TAG} from './spike/ads';
import {log} from './spike/log';

const CONTENT_URL =
  'https://archive.org/download/BigBuckBunny_328/BigBuckBunny_512kb.mp4';

/** The library as an app uses it: one hook, two components. */
export const HookDemo = () => {
  const [player, setPlayer] = useState<VideoPlayer | null>(null);
  const [vmapUrl] = useState(() => `${VMAP_OPTIMIZED_POD_TAG}${Date.now()}`);

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
    onEvent: (name) => log(`hook event: ${name}`),
  });

  return (
    <View style={styles.root}>
      <DualSurfaceView surfaces={ads.surfaces} contentPlayer={player} />
      <AdOverlay ui={ads.ui} onSkip={ads.skip} />
      <Text style={styles.state}>
        {`hook: ${ads.snapshot.state}${ads.ui.visible ? ` · ${ads.ui.label}` : ''}`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  state: {position: 'absolute', right: 20, bottom: 20, zIndex: 20, color: '#9f9', fontSize: 18},
});
