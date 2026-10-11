import { type ReactElement, useEffect, useRef } from 'react';
import { AccessibilityInfo, Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { defaultAdUiStrings, type AdUiStrings, type PauseAdView } from 'react-native-ads-core';

export interface PauseAdProps {
  /** `ads.pauseAd`: the pause ad to show, or null. */
  view: PauseAdView | null;
  strings?: Partial<AdUiStrings>;
  style?: StyleProp<ViewStyle>;
}

/** The largest side card, as in the IAB CTV Ad Portfolio partial pause ad (600×600 at 1080p). */
const MAX_HEIGHT = 600;
const QR_SIZE = 180;

/**
 * A pause ad (IAB CTV Ad Portfolio): a still image beside the paused picture, without sound.
 * Takes no D-pad focus; Back closes it (`useVegaAds` handles the key). Announced once for VoiceView.
 */
export function PauseAd({ view, strings, style }: PauseAdProps): ReactElement | null {
  const s = { ...defaultAdUiStrings, ...strings };
  const announced = useRef(false);

  useEffect(() => {
    if (!view) {
      announced.current = false;
      return;
    }
    if (!announced.current) {
      announced.current = true;
      AccessibilityInfo.announceForAccessibility(s.announcePauseAd);
    }
  }, [view, s.announcePauseAd]);

  if (!view) {
    return null;
  }
  const scale = view.height > MAX_HEIGHT ? MAX_HEIGHT / view.height : 1;
  const size = { width: Math.round(view.width * scale), height: Math.round(view.height * scale) };
  return (
    <View style={[styles.root, style]} pointerEvents="none">
      <Text style={styles.label}>{s.ad}</Text>
      <Image source={{ uri: view.imageUrl }} style={size} resizeMode="contain" />
      {view.qr?.imageUrl ? (
        <View style={styles.qr}>
          <Image source={{ uri: view.qr.imageUrl }} style={styles.qrImage} />
          <Text style={styles.hint}>{s.scanQr}</Text>
        </View>
      ) : null}
      <Text style={styles.hint}>{s.pauseAdHint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', right: 64, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'flex-end', zIndex: 10 },
  label: { color: '#fff', fontSize: 22, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
  qr: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  qrImage: { width: QR_SIZE, height: QR_SIZE, marginRight: 16 },
  hint: { color: '#fff', fontSize: 22, marginTop: 8, textShadowColor: '#000', textShadowRadius: 4 },
});
