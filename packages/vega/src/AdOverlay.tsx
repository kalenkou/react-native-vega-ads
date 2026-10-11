import { useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import type { AdUiState } from '@vega-ads/core';

export interface AdOverlayProps {
  ui: AdUiState;
  onSkip: () => void;
  style?: StyleProp<ViewStyle>;
}

/** The part of the label that names the ad ("Ad 1 of 3"), without the countdown. */
function adName(label: string): string {
  return label.split(' · ')[0] ?? label;
}

/**
 * Ad label ("Ad 1 of 3 · 0:12") and a Skip button that takes D-pad focus.
 * Announces each ad once for VoiceView (R26).
 */
export function AdOverlay({ ui, onSkip, style }: AdOverlayProps): JSX.Element | null {
  const announced = useRef<string | null>(null);
  const key = ui.visible ? adName(ui.label) : null;

  useEffect(() => {
    if (key === null) {
      announced.current = null;
      return;
    }
    if (announced.current !== key) {
      announced.current = key;
      AccessibilityInfo.announceForAccessibility(ui.announcement);
    }
  }, [key, ui.announcement]);

  if (!ui.visible) {
    return null;
  }
  return (
    <View style={[styles.root, style]} pointerEvents="box-none">
      <Text style={styles.label}>{ui.label}</Text>
      {ui.skip.visible && (
        <TouchableOpacity
          testID="vega-ads-skip"
          style={[styles.skip, !ui.skip.enabled && styles.skipWaiting]}
          hasTVPreferredFocus
          accessibilityRole="button"
          accessibilityLabel={ui.skip.label}
          accessibilityState={{ disabled: !ui.skip.enabled }}
          onPress={() => {
            if (ui.skip.enabled) {
              onSkip();
            }
          }}>
          <Text style={styles.skipText}>{ui.skip.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 10 },
  label: {
    position: 'absolute',
    left: 48,
    top: 40,
    color: '#fff',
    fontSize: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  skip: {
    position: 'absolute',
    right: 48,
    bottom: 64,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderColor: '#fff',
    borderWidth: 2,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  skipWaiting: { opacity: 0.6 },
  skipText: { color: '#fff', fontSize: 24 },
});
