import { type ReactElement, useEffect, useRef } from 'react';
import { AccessibilityInfo, Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { defaultAdUiStrings, type AdUiStrings, type PauseAdView } from 'react-native-ads-core';
import type { AdStyles } from './AdStyles';
import { layoutScale, scaleStyles } from './layout';

export interface PauseAdProps {
  /** `ads.pauseAd`: the pause ad to show, or null. */
  view: PauseAdView | null;
  strings?: Partial<AdUiStrings>;
  style?: StyleProp<ViewStyle>;
  /** `pauseAdLabel` and `pauseAdHint`: your fonts and colours. */
  styles?: AdStyles;
}

/** The largest side card, as in the IAB CTV Ad Portfolio partial pause ad (600×600 at 1080p). */
const MAX_HEIGHT = 600;
const QR_SIZE = 180;
const QR_QUIET_ZONE = 14;

/**
 * A pause ad (IAB CTV Ad Portfolio): a still image beside the paused picture, without sound.
 * Centred on the right side by default; `style` moves it, for example clear of the app's controls.
 * Takes no D-pad focus; Back closes it (`useVegaAds` handles the key). Announced once for VoiceView.
 */
export function PauseAd({ view, strings, style, styles: app = {} }: PauseAdProps): ReactElement | null {
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
  // The VAST size is in pixels of the 1080p screen: the same share of it on React Native 0.83.
  const scale = (view.height > MAX_HEIGHT ? MAX_HEIGHT / view.height : 1) * layoutScale();
  const size = { width: Math.round(view.width * scale), height: Math.round(view.height * scale) };
  return (
    <View style={[styles.root, style]} pointerEvents="none">
      <Text style={[styles.label, app.pauseAdLabel]}>{s.ad}</Text>
      <View style={styles.row}>
        <Image source={{ uri: view.imageUrl }} style={size} resizeMode="contain" />
        {view.qr?.imageUrl ? (
          <View style={styles.qr}>
            <View style={styles.qrTile}>
              <Image source={{ uri: view.qr.imageUrl }} style={styles.qrImage} />
            </View>
            <Text style={[styles.hint, styles.qrHint, app.pauseAdHint]}>{s.scanQr}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.hint, app.pauseAdHint]}>{s.pauseAdHint}</Text>
    </View>
  );
}

const styles = StyleSheet.create(
  scaleStyles({
    root: {
      position: 'absolute',
      right: 64,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'flex-end',
      zIndex: 10,
    },
    label: {
      color: '#fff',
      fontSize: 26,
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginBottom: 8,
    },
    // The QR code stands left of the image, at its bottom: the card is no taller than the image.
    row: { flexDirection: 'row-reverse', alignItems: 'flex-end' },
    qr: { alignItems: 'center', marginRight: 16 },
    // A white tile with a quiet zone: a phone reads the code on a bright or busy picture too.
    qrTile: { backgroundColor: '#fff', padding: QR_QUIET_ZONE, borderRadius: 12 },
    qrImage: { width: QR_SIZE, height: QR_SIZE },
    // A long hint wraps under the tile instead of widening the card.
    qrHint: { maxWidth: QR_SIZE + 2 * QR_QUIET_ZONE, fontSize: 22, textAlign: 'center' },
    // The hints sit on the same dark backing as the "Ad" label, so they read on a bright picture.
    hint: {
      color: '#fff',
      fontSize: 26,
      marginTop: 8,
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 6,
      overflow: 'hidden',
    },
  }),
);
