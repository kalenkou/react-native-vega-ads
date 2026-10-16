import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import type {VegaAds} from 'react-native-vega-ads';
import {colors, fonts} from '../theme';
import {timecode} from '../time';
import {Timeline} from './Timeline';

export interface AdLayerProps {
  title: string;
  ads: VegaAds;
  /** Where the movie stopped for the break, and its length (seconds). */
  position: number;
  duration: number;
  /** Show why the break looks as it does (`ads.ui.why`). */
  showWhy: boolean;
}

/** "Ad 1 of 2 · 0:12" → ["AD 1/2", "0:12"]; any other label stays whole. */
export function splitAdLabel(label: string): [string, string] {
  const match = /^Ad (\d+) of (\d+) · (.+)$/.exec(label);
  return match ? [`AD ${match[1]}/${match[2]}`, match[3]] : [label, ''];
}

/**
 * The demo's own ad overlay ("Timecode" look), drawn through VegaAdsPlayer's `renderOverlay`
 * slot: ad label, why line, Skip and the movie's timeline with the break. The VoiceView
 * announcements come from `useAdAnnouncements` in PlayerChrome.
 */
export const AdLayer = ({
  title,
  ads,
  position,
  duration,
  showWhy,
}: AdLayerProps) => {
  const {ui} = ads;
  if (!ui.visible) {
    return null;
  }
  const [name, clock] = splitAdLabel(ui.label);
  const resumeAt = timecode(Math.floor(position));
  return (
    <View style={styles.root} pointerEvents="box-none" testID="ad-layer">
      {/* At the top: the ad creative keeps its own bottom line (brand, disclaimer) visible. */}
      <View style={styles.panel}>
        <View style={styles.row}>
          <View style={styles.label}>
            <Text style={styles.labelName}>{name}</Text>
            {clock !== '' && <Text style={styles.labelClock}>{clock}</Text>}
          </View>
          <Text style={styles.where}>
            {title} · break at {resumeAt}
          </Text>
        </View>
        {showWhy && ui.why !== '' && (
          <Text testID="vega-ads-why" style={styles.why}>
            {ui.why}
          </Text>
        )}
        <Timeline
          position={position}
          duration={duration}
          marks={ads.timeline.marks}
        />
        <View style={styles.times}>
          <Text style={styles.time}>00:00:00</Text>
          <Text style={styles.time}>movie resumes at {resumeAt}</Text>
          <Text style={styles.time}>{timecode(Math.floor(duration))}</Text>
        </View>
      </View>
      {ui.skip.visible ? (
        <TouchableOpacity
          testID="vega-ads-skip"
          hasTVPreferredFocus
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel={ui.skip.label}
          accessibilityState={{disabled: !ui.skip.enabled}}
          onPress={() => {
            if (ui.skip.enabled) {
              ads.skip();
            }
          }}
          style={[styles.skip, ui.skip.enabled && styles.skipReady]}>
          <Text
            style={[styles.skipText, ui.skip.enabled && styles.skipTextReady]}>
            {ui.skip.label}
          </Text>
        </TouchableOpacity>
      ) : (
        // Nothing to press, but the D-pad focus must stay on the ad, not on the page behind it.
        <TouchableOpacity
          testID="vega-ads-focus"
          hasTVPreferredFocus
          style={styles.focusAnchor}
          accessibilityLabel={ui.label}
          onPress={() => undefined}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {position: 'absolute', top: 0, bottom: 0, left: 0, right: 0},
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: 96,
    paddingTop: 48,
    paddingBottom: 28,
    gap: 16,
    backgroundColor: colors.scrim,
  },
  row: {flexDirection: 'row', alignItems: 'center', gap: 28},
  label: {flexDirection: 'row', borderRadius: 4, overflow: 'hidden'},
  labelName: {
    backgroundColor: colors.adBreak,
    color: colors.background,
    fontFamily: fonts.monoStrong,
    fontSize: 30,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  // A fixed width: a mono clock never changes length, and the custom font is measured late.
  labelClock: {
    backgroundColor: colors.panel,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 30,
    minWidth: 120,
    textAlign: 'center',
    paddingVertical: 8,
  },
  where: {color: colors.adBreak, fontFamily: fonts.mono, fontSize: 26},
  why: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 32,
    lineHeight: 42,
  },
  skip: {
    position: 'absolute',
    right: 96,
    bottom: 54,
    paddingHorizontal: 36,
    paddingVertical: 16,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  skipReady: {backgroundColor: colors.focus, borderColor: colors.text},
  skipText: {color: colors.muted, fontFamily: fonts.mono, fontSize: 28},
  skipTextReady: {color: colors.background, fontFamily: fonts.monoStrong},
  focusAnchor: {position: 'absolute', width: 1, height: 1, opacity: 0},
  times: {flexDirection: 'row', justifyContent: 'space-between'},
  time: {color: colors.muted, fontFamily: fonts.mono, fontSize: 22},
});
