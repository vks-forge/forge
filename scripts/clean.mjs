/**
 * Removes every build output folder (packages/*\/dist, apps/*\/dist).
 *
 * Why: stale dist/ output from an older layout once shadowed source; `build` cleans
 *   first so compiled output always matches src (conditional exports, code.md rule 10).
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
  for (const name of names)
    rmSync(join(group, name, 'dist'), { recursive: true, force: true });
}
