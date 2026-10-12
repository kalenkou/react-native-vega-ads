import { watchReport, watchReportLabel } from '../../src/manager/watchReport';

describe('watchReport: what the viewer was spared, from the onEvent names of one watch', () => {
  it('counts the ads, what was left out and how much quieter the ads played', () => {
    const report = watchReport([
      'impression', 'start', 'loudness:-8.7', 'complete', 'breakEnd',
      'skipped:repeat', 'skipped:category', 'skipped:advertiser', 'error:205',
      'impression', 'loudness:-3.2', 'skip',
      'pauseAd:impression', 'pauseAd:close',
    ]);
    expect(report).toEqual({
      ads: 2,
      skipped: 1,
      repeatsLeftOut: 1,
      sameAdvertiserLeftOut: 1,
      blockedAfterScene: 1,
      quieter: 2,
      mostTurnedDownDb: 8.7,
      pauseAds: 1,
    });
    expect(watchReportLabel(report)).toBe(
      '2 ads · 1 repeat left out · 1 ad of the same brand left out · 1 ad left out after a scene · 2 ads turned down, up to 9 dB · 1 skipped',
    );
  });

  it('says so when nothing was left out or turned down', () => {
    const report = watchReport(['impression', 'impression', 'impression', 'loudness:0.0']);
    expect(report.quieter).toBe(0);
    expect(watchReportLabel(report)).toBe('3 ads · none left out or turned down');
  });

  it('is empty before any ad', () => {
    expect(watchReportLabel(watchReport(['vmap:error:301']))).toBe('');
  });

  it("takes the app's own words", () => {
    const label = watchReportLabel(watchReport(['impression']), { watchReport: (r) => `${r.ads} Spot` });
    expect(label).toBe('1 Spot');
  });
});
