import { readFileSync } from 'fs';
import { join } from 'path';
import { VERSION } from '../src';

describe('package smoke test', () => {
  it('exposes the version from package.json', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });
});
