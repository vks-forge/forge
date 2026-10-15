/**
 * Read a repository root from disk and detect its ecosystems and suggested checks.
 *
 * Why: the new-project form needs suggestions before anything is saved, from the user's own
 *   clone, without running a build tool. This reads only the names in the root folder and the
 *   root `package.json` (size-capped, never executed), then hands them to the pure detector.
 *   A folder or file that cannot be read gives an empty suggestion, not an error: the user
 *   can still fill in the checks by hand.
 *
 * Exports: detectProjectAt().
 * Depends on: node:fs/promises, node:path, domain/detect-project. IO: reads a folder and one file.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { detectProject } from '#/domain/detect-project.js';
import type { DetectedProject } from '#/types/detect-project.types.js';

/** A `package.json` above this size is not a manifest worth parsing for script names. */
const MAX_MANIFEST_BYTES = 1024 * 1024;

async function readManifest(root: string): Promise<unknown> {
  const file = join(root, 'package.json');
  try {
    if ((await stat(file)).size > MAX_MANIFEST_BYTES) {
      return undefined;
    }

    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

export async function detectProjectAt(root: string): Promise<DetectedProject> {
  let rootEntries: string[] = [];
  try {
    rootEntries = await readdir(root);
  } catch {
    return { ecosystems: [], checks: [] };
  }

  const packageJson = rootEntries.includes('package.json')
    ? await readManifest(root)
    : undefined;

  return detectProject({
    rootEntries,
    ...(packageJson === undefined ? {} : { packageJson }),
  });
}
