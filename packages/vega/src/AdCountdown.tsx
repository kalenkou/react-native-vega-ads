import { type ReactElement, useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { adCountdownState, type AdUiStrings } from 'react-native-ads-core';

export interface AdCountdownProps {
  /** `ads.timeline.nextBreakIn`: whole seconds to the next break, or null. */
  nextBreakIn: number | null;
  strings?: Partial<AdUiStrings>;
  style?: StyleProp<ViewStyle>;
}

/**
 * "Ad in 5" before a mid-roll, so the break never comes as a surprise. Takes no D-pad focus:
 * the viewer is still watching. Announces the coming break once for VoiceView.
 */
export function AdCountdown({ nextBreakIn, strings, style }: AdCountdownProps): ReactElement | null {
  const state = adCountdownState(nextBreakIn, strings);
  const announced = useRef(false);

  useEffect(() => {
    if (!state.visible) {
      announced.current = false;
      return;
    }
    if (!announced.current) {
      announced.current = true;
      AccessibilityInfo.announceForAccessibility(state.announcement);
    }
  }, [state.visible, state.announcement]);

  if (!state.visible) {
    return null;
  }
  return (
    <View style={[styles.root, style]} pointerEvents="none">
      <Text style={styles.label}>{state.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', right: 48, top: 40, zIndex: 10 },
  label: {
    color: '#fff',
    fontSize: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
