import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TempDirs } from '../src/tempDirs';

describe('TempDirs', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'temp-dirs-test-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('removes the folders still open when the run is stopped (Ctrl+C)', async () => {
    const dirs = new TempDirs(root);
    const done = await dirs.make('make-vmap-');
    const open = await dirs.make('make-vmap-context-');
    await dirs.remove(done);
    expect(existsSync(done)).toBe(false);
    expect(existsSync(open)).toBe(true);

    dirs.removeAllSync();
    expect(existsSync(open)).toBe(false);
  });

  it('makes each folder in the given parent folder, with the prefix', async () => {
    const dirs = new TempDirs(root);
    const dir = await dirs.make('make-vmap-');
    expect(dir.startsWith(join(root, 'make-vmap-'))).toBe(true);
    dirs.removeAllSync();
  });
});
