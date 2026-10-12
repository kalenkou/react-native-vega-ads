import { AdUiStrings, defaultAdUiStrings } from '../ui/adUiState';

/** What one watch of a title showed and what it spared the viewer. */
export interface WatchReport {
  /** Linear ads that started (impressions). */
  ads: number;
  /** Ads the viewer skipped. */
  skipped: number;
  /** Ads left out because the viewer saw them recently. */
  repeatsLeftOut: number;
  /** Ads left out because the same brand had just played. */
  sameAdvertiserLeftOut: number;
  /** Ads left out because the scene before the break blocks their category. */
  blockedAfterScene: number;
  /** Ads loaded quieter than their file, to match the content. */
  quieter: number;
  /** The most an ad was turned down, dB; 0 when none was. */
  mostTurnedDownDb: number;
  /** Ads shown while the content was paused. */
  pauseAds: number;
}

/**
 * Sums up the names that `onEvent` gave during one watch: collect them from Play to close and
 * pass them here. Counts what the viewer was spared, for a line after the movie or a log.
 */
export function watchReport(events: readonly string[]): WatchReport {
  const report: WatchReport = {
    ads: 0,
    skipped: 0,
    repeatsLeftOut: 0,
    sameAdvertiserLeftOut: 0,
    blockedAfterScene: 0,
    quieter: 0,
    mostTurnedDownDb: 0,
    pauseAds: 0,
  };
  for (const name of events) {
    if (name === 'impression') report.ads += 1;
    else if (name === 'skip') report.skipped += 1;
    else if (name === 'skipped:repeat') report.repeatsLeftOut += 1;
    else if (name === 'skipped:advertiser') report.sameAdvertiserLeftOut += 1;
    else if (name === 'skipped:category') report.blockedAfterScene += 1;
    else if (name === 'pauseAd:impression') report.pauseAds += 1;
    else if (name.startsWith('loudness:')) {
      // `loudness:<content - ad>`: negative when the ad was turned down.
      const down = -Number(name.slice('loudness:'.length));
      if (down > 0) {
        report.quieter += 1;
        report.mostTurnedDownDb = Math.max(report.mostTurnedDownDb, down);
      }
    }
  }
  return report;
}

/** "3 ads · 1 repeat left out · 2 ads turned down, up to 9 dB"; empty when no ad played. */
export function watchReportLabel(report: WatchReport, strings: Partial<AdUiStrings> = {}): string {
  return report.ads > 0 ? { ...defaultAdUiStrings, ...strings }.watchReport(report) : '';
}
