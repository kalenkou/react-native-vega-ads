import React, {useCallback, useEffect, useState} from 'react';
import {Image, Text, TouchableOpacity, View} from 'react-native';
import {AdIdRetriever} from '@amazon-devices/kepler-adid-retriever';
import {adPlanLabel, useAdPlan, type AdPlan} from 'react-native-vega-ads';
import type {Movie} from '../catalog';
import {BreakMap} from '../components/BreakMap';
import {colors, fonts, layoutStyles} from '../theme';
import {formatTime} from '../time';

export interface DetailsScreenProps {
  movie: Movie;
  /** Title of the movie the second button switches to. */
  next: string;
  /** What the last watch of this title showed and spared the viewer; null before one. */
  lastWatch?: string | null;
  onPlay: () => void;
  /** Where the viewer was when the system ended the app: Play continues there. */
  resumeAt?: number | null;
  /** Plays the movie with ads as usual; no button without it or without a classic schedule. */
  onCompare?: () => void;
  onNext: () => void;
  /** Called when the poster has loaded or failed: the page is fully drawn. */
  onDrawn?: () => void;
}

/** "1 ad · 10 s · skip after 5 s": the pre-roll right after Play. */
function prerollLabel(plan: AdPlan): string {
  const pre = plan.preroll;
  if (!pre) {
    return '';
  }
  const ads = pre.ads === 1 ? '1 ad' : `${pre.ads} ads`;
  const skip = pre.skipAfter === null ? '' : ` · skip after ${pre.skipAfter} s`;
  return `${ads} · ${pre.seconds} s${skip}`;
}

/** The plan of one title: the page draws it only while that title is on screen. */
interface TitlePlan {
  vmapUrl: string;
  plan: AdPlan | null;
}

/** The ad plan request waits this long for the poster, like the splash in launch.ts. */
const PLAN_WAIT_MS = 5000;

/**
 * Asks for the ad plan and hands it to the page. The page mounts it only after the poster is drawn:
 * on a cold start on React Native 0.83 the first read of `AdIdRetriever` loads its Turbo Module,
 * which waits for Vega's ad ID service and holds the JavaScript thread for 0.5 to 2.6 s (FL-38).
 * Before the poster, that wait delays the whole page. Metro's inline requires (the default) load
 * the module at this first read, so keep every reference to `AdIdRetriever` in here.
 */
const AdPlanRequest = ({
  vmapUrl,
  onPlan,
}: {
  vmapUrl: string;
  onPlan: (plan: TitlePlan) => void;
}) => {
  const plan = useAdPlan({vmapUrl}, {adId: AdIdRetriever});
  useEffect(() => onPlan({vmapUrl, plan}), [vmapUrl, plan, onPlan]);
  return null;
};

/** The movie page: poster, story, Play (with the D-pad focus), the next title and the break map. */
export const DetailsScreen = ({
  movie,
  next,
  lastWatch = null,
  onPlay,
  resumeAt = null,
  onCompare,
  onNext,
  onDrawn,
}: DetailsScreenProps) => {
  const [focused, setFocused] = useState<'play' | 'compare' | 'next' | null>(
    null,
  );
  useEffect(() => {
    // The first screen is ready: Vega's cool-start KPI ends here.
    (
      globalThis as {performance?: {reportFullyDrawn?: () => void}}
    ).performance?.reportFullyDrawn?.();
  }, []);
  // Ask for the schedule and the pre-roll once the poster is drawn: after Play the ad only has to
  // buffer, and the viewer sees how many ads the movie has before pressing Play.
  const [drawn, setDrawn] = useState(false);
  const [titlePlan, setTitlePlan] = useState<TitlePlan | null>(null);
  // After Next the previous title's plan is still in state for a moment: never draw it.
  const plan = titlePlan?.vmapUrl === movie.vmapUrl ? titlePlan.plan : null;
  const handleDrawn = useCallback(() => {
    setDrawn(true);
    onDrawn?.();
  }, [onDrawn]);
  // A poster that never loads must not keep the ads away: ask anyway after PLAN_WAIT_MS.
  useEffect(() => {
    const timer = setTimeout(() => setDrawn(true), PLAN_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.root}>
      <Image
        source={{uri: movie.poster}}
        style={styles.poster}
        resizeMode="cover"
        onLoad={handleDrawn}
        onError={handleDrawn}
      />
      {drawn && (
        <AdPlanRequest
          key={movie.vmapUrl}
          vmapUrl={movie.vmapUrl}
          onPlan={setTitlePlan}
        />
      )}
      <View style={styles.scrim} />
      <View style={styles.content}>
        <Text style={styles.title}>{movie.title}</Text>
        <Text style={styles.meta}>{movie.meta}</Text>
        {plan && (
          <Text testID="ad-plan" style={styles.adPlan}>
            Ads: {adPlanLabel(plan)}
          </Text>
        )}
        {lastWatch && (
          <Text testID="last-watch" style={styles.adPlan}>
            {lastWatch}
          </Text>
        )}
        <Text style={styles.description}>{movie.description}</Text>
        <View style={styles.buttons}>
          <TouchableOpacity
            testID="play"
            hasTVPreferredFocus
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel={
              resumeAt === null
                ? `Play ${movie.title}`
                : `Continue ${movie.title} at ${formatTime(resumeAt)}`
            }
            onPress={onPlay}
            onFocus={() => setFocused('play')}
            onBlur={() => setFocused(null)}
            style={[styles.button, focused === 'play' && styles.buttonFocused]}>
            <Text
              style={[
                styles.buttonText,
                focused === 'play' && styles.buttonTextFocused,
              ]}>
              {resumeAt === null
                ? 'Play'
                : `Continue at ${formatTime(resumeAt)}`}
            </Text>
          </TouchableOpacity>
          {onCompare && movie.classicVmapUrl && (
            <TouchableOpacity
              testID="compare"
              activeOpacity={1}
              accessibilityRole="button"
              accessibilityLabel="Compare: play with ads as usual"
              onPress={onCompare}
              onFocus={() => setFocused('compare')}
              onBlur={() => setFocused(null)}
              style={[
                styles.button,
                focused === 'compare' && styles.buttonFocused,
              ]}>
              <Text
                style={[
                  styles.buttonText,
                  focused === 'compare' && styles.buttonTextFocused,
                ]}>
                Compare: ads as usual
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            testID="next"
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel={`Next title: ${next}`}
            onPress={onNext}
            onFocus={() => setFocused('next')}
            onBlur={() => setFocused(null)}
            style={[styles.button, focused === 'next' && styles.buttonFocused]}>
            <Text
              style={[
                styles.buttonText,
                focused === 'next' && styles.buttonTextFocused,
              ]}>
              Next: {next}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      {plan && plan.marks.length > 0 && (
        <View style={styles.map}>
          <BreakMap
            plan={plan}
            duration={movie.duration}
            prerollLabel={prerollLabel(plan)}
          />
        </View>
      )}
      <Text style={styles.credit}>{movie.credit}</Text>
    </View>
  );
};

const styles = layoutStyles({
  root: {flex: 1, backgroundColor: colors.background},
  poster: {position: 'absolute', top: 0, left: 0, right: 0, height: 640},
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 640,
    backgroundColor: 'rgba(11,14,20,0.66)',
  },
  content: {position: 'absolute', left: 96, top: 72, width: 960},
  title: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 104,
    lineHeight: 112,
  },
  meta: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 26,
    marginTop: 8,
  },
  adPlan: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 24,
    marginTop: 8,
  },
  description: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 28,
    lineHeight: 40,
    marginTop: 20,
    maxWidth: 860,
  },
  buttons: {flexDirection: 'row', gap: 20, marginTop: 28},
  button: {
    paddingHorizontal: 36,
    paddingVertical: 16,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  buttonFocused: {
    backgroundColor: colors.focus,
    borderColor: colors.text,
    transform: [{scale: 1.05}],
  },
  buttonText: {color: colors.text, fontFamily: fonts.body, fontSize: 30},
  buttonTextFocused: {color: colors.background, fontFamily: fonts.bodyStrong},
  map: {position: 'absolute', left: 96, top: 690},
  credit: {
    position: 'absolute',
    left: 96,
    bottom: 40,
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 20,
  },
});
