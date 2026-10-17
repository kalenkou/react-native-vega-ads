import { type ReactElement, useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import type { AdUiState } from 'react-native-ads-core';
import { AdSkipButton } from './AdSkipButton';
import type { AdStyles } from './AdStyles';

export interface AdOverlayProps {
  ui: AdUiState;
  onSkip: () => void;
  /** Show `ui.why` under the label: why an ad is missing or quieter. Off by default. */
  showWhy?: boolean;
  /**
   * Show the ad's closed caption (`ui.caption`, from its VAST `<ClosedCaptionFiles>`) at the
   * bottom. Turn it on when the viewer has captions on. Off by default.
   */
  captions?: boolean;
  /** The overlay's box over the video. */
  style?: StyleProp<ViewStyle>;
  /** Your fonts and colours for the label, the why line and Skip. */
  styles?: AdStyles;
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
  const key = ui.visible ? ui.name : null;
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
export function AdOverlay({ ui, onSkip, showWhy = false, captions = false, style, styles: app = {} }: AdOverlayProps): ReactElement | null {
  useAdAnnouncements(ui);

  if (!ui.visible) {
    return null;
  }
  return (
    <View style={[styles.root, style]} pointerEvents="box-none">
      <Text style={[styles.label, app.label]}>{ui.label}</Text>
      {showWhy && ui.why !== '' && (
        <Text testID="vega-ads-why" style={[styles.why, app.why]}>
          {ui.why}
        </Text>
      )}
      {captions && ui.caption !== '' && (
        <View testID="vega-ads-caption" style={styles.captionBox} pointerEvents="none">
          <Text style={[styles.caption, app.caption]}>{ui.caption}</Text>
        </View>
      )}
      <AdSkipButton ui={ui} onSkip={onSkip} styles={app} />
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
    fontSize: 28,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  why: {
    position: 'absolute',
    left: 48,
    top: 96,
    maxWidth: 1200,
    color: '#fff',
    fontSize: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  // Above the Skip button's row, centred like TV captions.
  captionBox: { position: 'absolute', left: 0, right: 0, bottom: 140, alignItems: 'center' },
  caption: {
    maxWidth: 1400,
    color: '#fff',
    fontSize: 32,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
});
