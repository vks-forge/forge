/**
 * Removes every build output folder (packages/*\/dist, apps/*\/dist).
 *
 * Why: a stale `dist/` from an older layout once shadowed source files at import time,
 *   so tests and tools ran code that no longer existed. Build cleans every package and
 *   app output first, so what runs always matches current source. Missing folders are
 *   not an error.
 *
 * Exports: none (script).
 * Depends on: node:fs, node:path. IO: deletes dist folders.
 */

import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

for (const group of ['packages', 'apps']) {
  let names = [];
  try {
    names = readdirSync(group);
  } catch {
    continue;
  }

  for (const name of names) {
    rmSync(join(group, name, 'dist'), { recursive: true, force: true });
  }
}
