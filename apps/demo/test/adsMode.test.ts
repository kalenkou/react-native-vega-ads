import {adsMode} from '../src/adsMode';
import {MOVIES} from '../src/catalog';

const avoidRepeats = {memory: {read: async () => null, write: async () => {}}};

describe('adsMode', () => {
  const movie = MOVIES.find((m) => m.classicVmapUrl)!;

  it('plays the movie with all of vega-ads by default', () => {
    expect(adsMode(movie, false, avoidRepeats)).toEqual({
      ads: {vmapUrl: movie.vmapUrl},
      pauseAdUrl: movie.pauseAdUrl,
      avoidRepeats,
      contentLoudness: movie.contentLoudness,
      showWhy: true,
      countdown: true,
    });
  });

  it('plays ads as usual to compare with: timer schedule, repeats, no loudness guard', () => {
    expect(adsMode(movie, true, avoidRepeats)).toEqual({
      ads: {vmapUrl: movie.classicVmapUrl},
      pauseAdUrl: undefined,
      avoidRepeats: false,
      contentLoudness: undefined,
      showWhy: false,
      countdown: false,
    });
  });

  it('falls back to the usual schedule for a title without a classic one', () => {
    const plain = {...movie, classicVmapUrl: undefined};
    expect(adsMode(plain, true, avoidRepeats).ads).toEqual({
      vmapUrl: movie.vmapUrl,
    });
  });
});
