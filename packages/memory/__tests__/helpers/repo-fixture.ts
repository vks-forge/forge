/**
 * Builds throwaway memory repositories for the importer tests.
 *
 * Why: the importer reads the last commit of a real git repository and later deletes the folder, so its tests
 *   need real repositories: either hand-made files or a copy of this project's own `.forge/memory` records,
 *   which are the real-world mix of clean headers, headers strict YAML rejects, hand-written outcome notes
 *   and old kind words. Using the package's own git runner keeps the sandboxed git settings the product uses.
 *
 * Exports: makeRepo(), commitAll(), copyDevMemory(), DEV_MEMORY_DIR.
 * Depends on: node:fs/promises, node:path, node:url, shared/git. IO: temp folders and `git`.
 */

import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGit } from '#/shared/git.js';

/** This repository's own memory folder, the dev team's records. */
export const DEV_MEMORY_DIR = fileURLToPath(
  new URL('../../../../.forge/memory', import.meta.url),
);

/** Stages everything and commits it; returns the new HEAD. */
export async function commitAll(dir: string, message: string): Promise<string> {
  await runGit(dir, ['add', '-A']);
  await runGit(dir, ['commit', '-m', message]);

  return runGit(dir, ['rev-parse', 'HEAD']);
}

/** Creates `<root>/<slug>` as a repository holding `files` (path to text) in one commit; returns its folder. */
export async function makeRepo(
  root: string,
  slug: string,
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const dir = join(root, slug);
  await mkdir(dir, { recursive: true });
  await runGit(dir, ['init']);
  for (const [rel, text] of Object.entries(files)) {
    const path = join(dir, ...rel.split('/'));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, 'utf8');
  }

  if (Object.keys(files).length > 0) {
    await commitAll(dir, 'seed');
  }

  return dir;
}

/** Copies this repository's records (the four folders) into `<root>/<slug>` and commits them. */
export async function copyDevMemory(root: string, slug: string): Promise<string> {
  const dir = join(root, slug);
  await mkdir(dir, { recursive: true });
  await runGit(dir, ['init']);
  for (const folder of ['decisions', 'rejected', 'proposed', 'outcomes']) {
    await cp(join(DEV_MEMORY_DIR, folder), join(dir, folder), { recursive: true });
  }

  await commitAll(dir, 'seed');

  return dir;
}
