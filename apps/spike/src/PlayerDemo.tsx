import React from 'react';
import {StyleSheet, Text} from 'react-native';
import {AdIdRetriever} from '@amazon-devices/kepler-adid-retriever';
import {VegaAdsPlayer} from 'react-native-vega-ads';
import {VMAP_OPTIMIZED_POD_TAG} from './spike/ads';
import {log} from './spike/log';
import {DEMO_MEDIA_BASE} from './spikeConfig';

const CONTENT_URL = DEMO_MEDIA_BASE
  ? `${DEMO_MEDIA_BASE}tears_of_steel_720p.mp4`
  : 'https://archive.org/download/BigBuckBunny_328/BigBuckBunny_512kb.mp4';

/** The one-component integration: what a new Vega app writes. */
export const PlayerDemo = ({onClose}: {onClose: () => void}) => (
  <VegaAdsPlayer
    source={{uri: CONTENT_URL}}
    ads={{
      vmapUrl: DEMO_MEDIA_BASE
        ? `${DEMO_MEDIA_BASE}vmap/movie.xml`
        : `${VMAP_OPTIMIZED_POD_TAG}${Date.now()}`,
    }}
    adId={AdIdRetriever}
    onEnd={onClose}
    onEvent={(name: string) => log(`player event: ${name}`)}>
    {({ads}) =>
      !ads.playing && <Text style={styles.controls}>App controls (hidden during ads)</Text>
    }
  </VegaAdsPlayer>
);

const styles = StyleSheet.create({
  controls: {position: 'absolute', bottom: 40, left: 40, color: '#fff', fontSize: 28, zIndex: 5},
});
