import * as core from '../src';

describe('public API', () => {
  it('exposes a version string', () => {
    expect(core.VERSION).toBe('0.0.0');
  });

  it.each([
    'installImagePolyfill',
    'createUrlHandler',
    'describeFailure',
    'requestVast',
    'requestVmap',
    'parseTimeOffset',
    'selectMediaFile',
    'BreakScheduler',
    'silentLogger',
  ])('exports %s', (name) => {
    expect((core as Record<string, unknown>)[name]).toBeDefined();
  });
});
