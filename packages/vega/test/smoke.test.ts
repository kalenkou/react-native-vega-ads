import { readFileSync } from 'fs';
import { join } from 'path';
import { MAX_REDIRECTS, useVegaVideoPlayer, useVideoPlayer, VERSION } from '../src';

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
});
