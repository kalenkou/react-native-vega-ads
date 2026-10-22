import { readFileSync } from 'fs';
import { join } from 'path';
import { layoutScale, MAX_REDIRECTS, scaleStyles, useVegaVideoPlayer, useVideoPlayer, VERSION } from '../src';

describe('package smoke test', () => {
  it('exposes the version from package.json', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });

  it("also exports useVideoPlayer as useVegaVideoPlayer, apart from react-native-video's hook", () => {
    expect(useVegaVideoPlayer).toBe(useVideoPlayer);
  });

  it('exports the default maxRedirects, so an app can raise it without a direct dependency on core', () => {
    expect(MAX_REDIRECTS).toBe(5);
  });

  it('exports the layout scale, so an app can size its own UI for React Native 0.72 and 0.83', () => {
    expect(layoutScale(960)).toBe(0.5);
    expect(scaleStyles({ a: { fontSize: 28 } }, 0.5)).toEqual({ a: { fontSize: 14 } });
  });
});
