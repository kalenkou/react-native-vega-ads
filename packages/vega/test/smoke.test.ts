import { VERSION } from '../src';

describe('package smoke test', () => {
  it('exposes a version string', () => {
    expect(VERSION).toBe('0.0.0');
  });
});
