import type { ReactElement } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import type { AdUiState } from 'react-native-ads-core';
import type { AdStyles } from './AdStyles';

export interface AdSkipButtonProps {
  /** `ads.ui` */
  ui: AdUiState;
  /** `ads.skip` */
  onSkip: () => void;
  /** `skip`, `skipWaiting`, `skipText` and `skipWaitingText` are used. */
  styles?: AdStyles;
}

/**
 * The Skip button for an ad overlay, own or built-in: it takes the D-pad focus, ignores presses
 * until Skip is allowed and tells VoiceView it is disabled. During a non-skippable ad it holds the
 * focus with an invisible anchor, so the remote does not move focus to the screen behind the ad.
 * VoiceView reads the focused element again whenever its label changes, so both labels stay the
 * same for the whole ad: "Skip Ad" during the countdown, the ad's name without the clock.
 */
export function AdSkipButton({ ui, onSkip, styles: app = {} }: AdSkipButtonProps): ReactElement | null {
  if (!ui.visible) {
    return null;
  }
  if (!ui.skip.visible) {
    return (
      <TouchableOpacity
        testID="vega-ads-focus"
        style={styles.focusAnchor}
        hasTVPreferredFocus
        accessibilityLabel={ui.name}
        onPress={() => undefined}
      />
    );
  }
  const waiting = !ui.skip.enabled;
  return (
    <TouchableOpacity
      testID="vega-ads-skip"
      style={[styles.skip, app.skip, waiting && styles.skipWaiting, waiting && app.skipWaiting]}
      hasTVPreferredFocus
      accessibilityRole="button"
      accessibilityLabel={ui.skip.accessibilityLabel}
      accessibilityState={{ disabled: waiting }}
      onPress={() => {
        if (ui.skip.enabled) {
          onSkip();
        }
      }}>
      <Text style={[styles.skipText, app.skipText, waiting && app.skipWaitingText]}>{ui.skip.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
  skipText: { color: '#fff', fontSize: 28 },
  focusAnchor: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
