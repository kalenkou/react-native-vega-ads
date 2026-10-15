import { type ReactElement, useEffect, useRef } from 'react';
import { Dimensions, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { KeplerVideoSurfaceView } from '@amazon-devices/react-native-w3cmedia';
import type { AdSurfaces } from './useVegaAds';

/** Marks the content surface as owned by the app (see AdSurfaceLayers). */
export const APP_CONTENT_SURFACE = 'app-owned';

/**
 * The two ad surfaces: ad A, and ad B above it. An ad surface is moved off screen
 * instead of being unmounted, so its native surface stays alive between ads and no
 * black frame appears on the switch (R11).
 */
export function AdLayers({ surfaces, scalingMode }: { surfaces: AdSurfaces; scalingMode: string }): ReactElement {
  const standby = useRef<string | null>(null);
  const offscreen = -Dimensions.get('window').width * 1.2;
  const shown = surfaces.shown;
  // B lies above A, so A may stay visible under B; a prebuffered B shows a still frame and stays hidden.
  const aLeft = shown !== null ? 0 : offscreen;
  const bLeft = shown !== null && shown === standby.current ? 0 : offscreen;
  return (
    <>
      <View testID="vega-ads-ad-a" style={[styles.layer, styles.adA, { left: aLeft, right: -aLeft }]}>
        <KeplerVideoSurfaceView
          style={styles.fill}
          scalingmode={scalingMode}
          onSurfaceViewCreated={(handle) => surfaces.onAdSurface(handle)}
          onSurfaceViewDestroyed={() => surfaces.onAdSurface(null)}
        />
      </View>
      <View testID="vega-ads-ad-b" style={[styles.layer, styles.adB, { left: bLeft, right: -bLeft }]}>
        <KeplerVideoSurfaceView
          style={styles.fill}
          scalingmode={scalingMode}
          onSurfaceViewCreated={(handle) => {
            standby.current = handle;
            surfaces.onStandbySurface(handle);
          }}
          onSurfaceViewDestroyed={() => {
            standby.current = null;
            surfaces.onStandbySurface(null);
          }}
        />
      </View>
    </>
  );
}

export interface AdSurfaceLayersProps {
  surfaces: AdSurfaces;
  /** w3cmedia scaling mode. Default 'fit'. */
  scalingMode?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * For apps that already render their own content surface (for example a Shaka player screen):
 * place this above it, covering the same area. It adds only the two ad surfaces.
 * Mount it after your content surface exists (after its `onSurfaceViewCreated`): on Vega a video
 * surface created later is drawn above the earlier ones, whatever the zIndex (FL-19).
 */
export function AdSurfaceLayers({ surfaces, scalingMode = 'fit', style }: AdSurfaceLayersProps): ReactElement {
  const { onContentSurface } = surfaces;
  useEffect(() => {
    onContentSurface(APP_CONTENT_SURFACE);
    return () => onContentSurface(null);
  }, [onContentSurface]);
  return (
    <View style={[styles.overlay, style]} pointerEvents="none">
      <AdLayers surfaces={surfaces} scalingMode={scalingMode} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Above a content surface and its captions (KeplerCaptionsView commonly uses zIndex 2).
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 3 },
  layer: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  adA: { zIndex: 2 },
  adB: { zIndex: 3 },
  fill: { flex: 1 },
});
