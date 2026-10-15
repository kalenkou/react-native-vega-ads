import { rmSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Temporary folders of one run. Node skips `finally` blocks when Ctrl+C ends the process,
 * so the folders still open are removed synchronously on SIGINT/SIGTERM (see main.ts).
 */
export class TempDirs {
  private readonly open = new Set<string>();

  constructor(private readonly parent: string) {}

  async make(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(this.parent, prefix));
    this.open.add(dir);
    return dir;
  }

  async remove(dir: string): Promise<void> {
    await rm(dir, { recursive: true, force: true });
    this.open.delete(dir);
  }

  removeAllSync(): void {
    for (const dir of this.open) {
      rmSync(dir, { recursive: true, force: true });
    }
    this.open.clear();
  }
}
