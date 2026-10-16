import { type ReactElement, useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import type { AdUiState } from 'react-native-ads-core';

export interface AdOverlayProps {
  ui: AdUiState;
  onSkip: () => void;
  /** Show `ui.why` under the label: why an ad is missing or quieter. Off by default. */
  showWhy?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** The part of the label that names the ad ("Ad 1 of 3"), without the countdown. */
function adName(label: string): string {
  return label.split(' · ')[0] ?? label;
}

/**
 * VoiceView announcements for an ad overlay: each ad once (R26), and the moment Skip becomes
 * possible, since a viewer who cannot see the button would not know it. `AdOverlay` calls it; call
 * it yourself when you draw your own overlay with `renderOverlay`.
 */
export function useAdAnnouncements(ui: AdUiState): void {
  const announced = useRef<string | null>(null);
  /** This ad has shown a Skip countdown, so "you can skip now" is news. */
  const skipWaited = useRef(false);
  const key = ui.visible ? adName(ui.label) : null;
  const waiting = ui.skip.visible && !ui.skip.enabled;

  useEffect(() => {
    if (key === null) {
      announced.current = null;
      return;
    }
    if (announced.current !== key) {
      announced.current = key;
      skipWaited.current = false;
      AccessibilityInfo.announceForAccessibility(ui.announcement);
    }
  }, [key, ui.announcement]);

  useEffect(() => {
    if (waiting) {
      skipWaited.current = true;
    } else if (skipWaited.current && ui.skipAnnouncement) {
      AccessibilityInfo.announceForAccessibility(ui.skipAnnouncement);
    }
  }, [waiting, ui.skipAnnouncement]);
}

/** Ad label ("Ad 1 of 3 · 0:12") and a Skip button that takes D-pad focus, with VoiceView announcements. */
export function AdOverlay({ ui, onSkip, showWhy = false, style }: AdOverlayProps): ReactElement | null {
  useAdAnnouncements(ui);

  if (!ui.visible) {
    return null;
  }
  return (
    <View style={[styles.root, style]} pointerEvents="box-none">
      <Text style={styles.label}>{ui.label}</Text>
      {showWhy && ui.why !== '' && (
        <Text testID="vega-ads-why" style={styles.why}>
          {ui.why}
        </Text>
      )}
      {!ui.skip.visible && (
        // Nothing to press, but the D-pad focus must stay on the ad, not on the app behind it.
        <TouchableOpacity
          testID="vega-ads-focus"
          style={styles.focusAnchor}
          hasTVPreferredFocus
          accessibilityLabel={ui.label}
          onPress={() => undefined}
        />
      )}
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
  why: {
    position: 'absolute',
    left: 48,
    top: 88,
    maxWidth: 1100,
    color: '#fff',
    fontSize: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 4,
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
  focusAnchor: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  skipText: { color: '#fff', fontSize: 24 },
});
