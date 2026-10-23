/**
 * Prep key — a fingerprint of what a setup run depends on.
 *
 * Why: installing dependencies takes seconds to minutes, so Forge must not repeat it for a
 *   worktree whose inputs have not changed, and must repeat it when they have (the Worker
 *   edited the lockfile, or the owner changed a step). The key is a sha256 of the steps
 *   as configured and the bytes of each step's `inputs` files, with a missing file counted as
 *   absent, so adding or deleting a lockfile also changes it. Paths are hashed relative to the
 *   step's folder, never absolute, so the same inputs give the same key in any worktree.
 *
 *   The copy-cache key of one step (`computeStepCacheKey`) is a second, stricter fingerprint: the
 *   command, folder, input bytes, the toolchain probe's output (`node --version`), the folders
 *   restored, and the OS and CPU, because an install built for one is wrong on another. Changing any one
 *   byte changes it, so a restore only ever gives back what the command would have produced.
 *
 *   Input globs are a file name or a pattern in the last path segment (`requirements*.txt`,
 *   `*.csproj`, `config/*.lock`); a pattern in a folder name is not expanded.
 *
 * Exports: stepFolder(), expandInputs(), computePrepKey(), computeStepCacheKey().
 * Depends on: node:crypto, node:fs/promises, node:path, @forge/core (SetupStep), shared/entry-glob. IO: reads input files.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import type { SetupStep } from '@forge/core';
import { entryMatcher } from '#/shared/entry-glob.js';

/** The folder a step runs in: the project folder, or the repository top with `at_repo_root`, then `cwd`. */
export function stepFolder(
  step: SetupStep,
  projectDir: string,
  repoRoot: string,
): string {
  const base = step.at_repo_root === true ? repoRoot : projectDir;

  return step.cwd === undefined ? base : join(base, step.cwd);
}

const slash = (p: string): string => p.split('\\').join('/');

const isFile = async (path: string): Promise<boolean> =>
  stat(path).then(
    (s) => s.isFile(),
    () => false,
  );

/** Absolute paths of the files `globs` name inside `folder`, sorted; `absent` lists literal names that do not exist. */
export async function expandInputs(
  folder: string,
  globs: readonly string[],
): Promise<{ files: string[]; absent: string[] }> {
  const files = new Set<string>();
  const absent: string[] = [];
  for (const glob of globs) {
    const normal = glob.replaceAll('\\', '/');
    if (!/[*?]/.test(normal)) {
      const full = join(folder, normal);
      if (await isFile(full)) {
        files.add(full);
      } else {
        absent.push(normal);
      }

      continue;
    }

    const dir = join(folder, dirname(normal));
    const match = entryMatcher(normal.slice(normal.lastIndexOf('/') + 1));
    const entries = match === null ? [] : await readdir(dir).catch(() => []);
    for (const name of entries) {
      const full = join(dir, name);
      if (match?.test(name) === true && (await isFile(full))) {
        files.add(full);
      }
    }
  }

  return { files: [...files].sort(), absent: absent.sort() };
}

/** sha256 hex of the steps' JSON and each step's input files, in step order. */
export async function computePrepKey(
  steps: readonly SetupStep[],
  projectDir: string,
  repoRoot: string,
): Promise<string> {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(steps));
  for (const [i, step] of steps.entries()) {
    const folder = stepFolder(step, projectDir, repoRoot);
    const { files, absent } = await expandInputs(folder, step.inputs);
    for (const name of absent) {
      hash.update(`\0${i}:${name}\0absent`);
    }

    for (const file of files) {
      hash.update(`\0${i}:${relative(folder, file).replaceAll('\\', '/')}\0`);
      hash.update(await readFile(file));
    }
  }

  return hash.digest('hex');
}

/** sha256 hex of everything a step's restorable outputs depend on; see the header. */
export async function computeStepCacheKey(
  step: SetupStep,
  folder: string,
  toolchain: string,
  platform: string = process.platform,
  arch: string = process.arch,
): Promise<string> {
  const hash = createHash('sha256');
  hash.update(
    JSON.stringify([
      step.command,
      step.cwd ?? '',
      step.at_repo_root === true,
      step.env,
      step.cache_outputs,
      toolchain,
      platform,
      arch,
    ]),
  );

  const { files, absent } = await expandInputs(folder, step.inputs);
  for (const name of absent) {
    hash.update(`\0${name}\0absent`);
  }

  for (const file of files) {
    hash.update(`\0${slash(relative(folder, file))}\0`);
    hash.update(await readFile(file));
  }

  return hash.digest('hex');
}
