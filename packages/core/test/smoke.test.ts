import { readFileSync } from 'fs';
import { join } from 'path';
import * as core from '../src';

describe('public API', () => {
  it('exposes the version from package.json', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as { version: string };
    expect(core.VERSION).toBe(pkg.version);
  });

  it('exports the main building blocks of the API', () => {
    const names = [
      'installImagePolyfill',
      'createUrlHandler',
      'describeFailure',
      'requestVast',
      'requestVmap',
      'parseTimeOffset',
      'selectMediaFile',
      'BreakScheduler',
      'PodController',
      'AdTracker',
      'adIdMacros',
      'AdBreakSession',
      'adUiState',
    ];
    const exported = Object.keys(core);
    expect(names.filter((name) => !exported.includes(name))).toEqual([]);
  });
});
