import { readFileSync } from 'fs';
import { join } from 'path';
import * as core from '../../src';

describe('public API', () => {
  it('exposes the version from package.json', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as { version: string };
    expect(core.VERSION).toBe(pkg.version);
  });

  it.each([
    'installImagePolyfill',
    'createUrlHandler',
    'describeFailure',
    'requestVast',
    'requestVmap',
    'parseTimeOffset',
    'selectMediaFile',
    'silentLogger',
    'AdTracker',
    'adIdMacros',
  ])('exports %s', (name) => {
    expect((core as Record<string, unknown>)[name]).toBeDefined();
  });
});
