import { useEffect, useRef, useState } from 'react';
import { Dimensions, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { KeplerVideoSurfaceView } from '@amazon-devices/react-native-w3cmedia';
import type { AdSurfaces } from './useVegaAds';

export interface DualSurfaceViewProps {
  surfaces: AdSurfaces;
  /**
   * Your content `VideoPlayer`. The view gives it the content surface, whichever
   * of the two is ready first. Leave it out to connect the surface yourself.
   */
  contentPlayer?: { setSurfaceHandle(handle: string): void; clearSurfaceHandle(handle: string): void } | null;
  onContentSurfaceCreated?: (handle: string) => void;
  onContentSurfaceDestroyed?: (handle: string) => void;
  /** w3cmedia scaling mode for all three surfaces. Default 'fit'. */
  scalingMode?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Three stacked video surfaces (R11): content, ad A above it, ad B above A.
 * An ad surface is moved off screen instead of being unmounted, so its native
 * surface stays alive between ads and no black frame appears on the switch.
 */
export function DualSurfaceView(props: DualSurfaceViewProps): JSX.Element {
  const { surfaces, contentPlayer, scalingMode = 'fit' } = props;
  const [contentSurface, setContentSurface] = useState<string | null>(null);
  useEffect(() => {
    if (!contentPlayer || !contentSurface) {
      return undefined;
    }
    contentPlayer.setSurfaceHandle(contentSurface);
    return () => {
      try {
        contentPlayer.clearSurfaceHandle(contentSurface);
      } catch {
        // The app may have released its player first; the surface is gone anyway.
      }
    };
  }, [contentPlayer, contentSurface]);
  const handles = useRef<{ a: string | null; b: string | null }>({ a: null, b: null });
  const offscreen = -Dimensions.get('window').width * 1.2;
  const shown = surfaces.shown;
  // B lies above A, so A may stay visible under B; a prebuffered B shows a still frame and stays hidden.
  const aLeft = shown !== null ? 0 : offscreen;
  const bLeft = shown !== null && shown === handles.current.b ? 0 : offscreen;

  return (
    <View style={[styles.root, props.style]}>
      <View testID="vega-ads-content" style={[styles.layer, styles.content]}>
        <KeplerVideoSurfaceView
          style={styles.fill}
          scalingmode={scalingMode}
          onSurfaceViewCreated={(handle) => {
            setContentSurface(handle);
            props.onContentSurfaceCreated?.(handle);
          }}
          onSurfaceViewDestroyed={(handle) => {
            setContentSurface(null);
            props.onContentSurfaceDestroyed?.(handle);
          }}
        />
      </View>
      <View testID="vega-ads-ad-a" style={[styles.layer, styles.adA, { left: aLeft, right: -aLeft }]}>
        <KeplerVideoSurfaceView
          style={styles.fill}
          scalingmode={scalingMode}
          onSurfaceViewCreated={(handle) => {
            handles.current.a = handle;
            surfaces.onAdSurface(handle);
          }}
          onSurfaceViewDestroyed={() => {
            handles.current.a = null;
            surfaces.onAdSurface(null);
          }}
        />
      </View>
      <View testID="vega-ads-ad-b" style={[styles.layer, styles.adB, { left: bLeft, right: -bLeft }]}>
        <KeplerVideoSurfaceView
          style={styles.fill}
          scalingmode={scalingMode}
          onSurfaceViewCreated={(handle) => {
            handles.current.b = handle;
            surfaces.onStandbySurface(handle);
          }}
          onSurfaceViewDestroyed={() => {
            handles.current.b = null;
            surfaces.onStandbySurface(null);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  layer: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  content: { zIndex: 1 },
  adA: { zIndex: 2 },
  adB: { zIndex: 3 },
  fill: { flex: 1 },
});
