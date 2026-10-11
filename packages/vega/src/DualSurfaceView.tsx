import { type ReactElement, useEffect, useState } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { KeplerVideoSurfaceView } from '@amazon-devices/react-native-w3cmedia';
import type { AdSurfaces } from './useVegaAds';
import { AdLayers } from './AdSurfaceLayers';

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
 * For a screen that already renders its own content surface, use AdSurfaceLayers.
 */
export function DualSurfaceView(props: DualSurfaceViewProps): ReactElement {
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

  return (
    <View style={[styles.root, props.style]}>
      <View testID="vega-ads-content" style={[styles.layer, styles.content]}>
        <KeplerVideoSurfaceView
          style={styles.fill}
          scalingmode={scalingMode}
          onSurfaceViewCreated={(handle) => {
            setContentSurface(handle);
            surfaces.onContentSurface(handle);
            props.onContentSurfaceCreated?.(handle);
          }}
          onSurfaceViewDestroyed={(handle) => {
            setContentSurface(null);
            surfaces.onContentSurface(null);
            props.onContentSurfaceDestroyed?.(handle);
          }}
        />
      </View>
      <AdLayers surfaces={surfaces} scalingMode={scalingMode} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  layer: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  content: { zIndex: 1 },
  fill: { flex: 1 },
});
