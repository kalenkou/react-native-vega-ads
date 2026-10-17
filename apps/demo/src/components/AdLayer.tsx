import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {AdSkipButton, type AdStyles, type VegaAds} from 'react-native-vega-ads';
import type {CaptionSettings} from '../captionSettings';
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
  /** The viewer's caption setting: the ad caption (`ads.ui.caption`) shows when it is on. */
  captions?: CaptionSettings;
}

/** The demo's short ad badge: "AD 1/2" in a pod, "AD" for a single ad. */
export function adBadge(ads: VegaAds): string {
  const {position, total} = ads.snapshot;
  return total > 1 ? `AD ${position}/${total}` : 'AD';
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
  captions,
}: AdLayerProps) => {
  const {ui} = ads;
  if (!ui.visible) {
    return null;
  }
  const name = adBadge(ads);
  const clock = ui.timeLeft;
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
      {captions?.enabled && ui.caption !== '' && (
        <View
          testID="ad-caption"
          style={styles.captionBox}
          pointerEvents="none">
          <Text style={[styles.caption, {fontSize: captions.fontSize}]}>
            {ui.caption}
          </Text>
        </View>
      )}
      <AdSkipButton ui={ui} onSkip={ads.skip} styles={skipStyles} />
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
  times: {flexDirection: 'row', justifyContent: 'space-between'},
  // Above the Skip button's row, centred like TV captions.
  captionBox: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 150,
    alignItems: 'center',
  },
  caption: {
    maxWidth: 1400,
    color: colors.text,
    fontFamily: fonts.body,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  time: {color: colors.muted, fontFamily: fonts.mono, fontSize: 22},
});

/** The library's Skip button (focus, VoiceView, the focus anchor) in the demo's look. */
const skipStyles: AdStyles = StyleSheet.create({
  skip: {
    right: 96,
    bottom: 54,
    paddingHorizontal: 36,
    paddingVertical: 16,
    borderRadius: 4,
    backgroundColor: colors.focus,
    borderColor: colors.text,
  },
  skipWaiting: {
    opacity: 1,
    backgroundColor: colors.panel,
    borderColor: colors.border,
  },
  skipText: {
    color: colors.background,
    fontFamily: fonts.monoStrong,
    fontSize: 28,
  },
  skipWaitingText: {color: colors.muted, fontFamily: fonts.mono},
});
