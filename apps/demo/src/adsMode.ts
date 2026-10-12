import type {RepeatOptions} from 'react-native-vega-ads';
import type {Movie} from './catalog';

/** The VegaAdsPlayer props that differ between vega-ads and ads as usual. */
export interface AdsMode {
  ads: {vmapUrl: string};
  pauseAdUrl: string | undefined;
  avoidRepeats: false | RepeatOptions;
  contentLoudness: number | undefined;
  showWhy: boolean;
  countdown: boolean;
}

/**
 * Ads as usual, for the "Compare" button: a break on a timer, the same ad again, ads louder
 * than the movie, no warning and no pause ad.
 */
export function adsMode(
  movie: Movie,
  classic: boolean,
  avoidRepeats: RepeatOptions,
): AdsMode {
  if (!classic) {
    return {
      ads: {vmapUrl: movie.vmapUrl},
      pauseAdUrl: movie.pauseAdUrl,
      avoidRepeats,
      contentLoudness: movie.contentLoudness,
      showWhy: true,
      countdown: true,
    };
  }
  return {
    ads: {vmapUrl: movie.classicVmapUrl ?? movie.vmapUrl},
    pauseAdUrl: undefined,
    avoidRepeats: false,
    contentLoudness: undefined,
    showWhy: false,
    countdown: false,
  };
}
