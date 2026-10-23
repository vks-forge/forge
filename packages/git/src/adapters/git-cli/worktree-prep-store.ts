/**
 * Preparation record store — one small JSON file per ticket worktree, beside the worktrees.
 *
 * Why: Forge installs a project's dependencies into each worktree before the Worker starts
 *   (d-0180) and must remember, per worktree, what it did: the key that lets an unchanged
 *   lockfile skip the next install, and the folders the install created, which have to stay out
 *   of the Worker's diff and commit. The record lives in `<worktreeRoot>/.forge-prep/` rather
 *   than in the tree, so it is outside every Worker cwd (the outside-cwd floor denies it), never
 *   shows up in `git status`, and is deleted with the worktree. A missing or damaged file reads
 *   as "never prepared", which only costs one more install.
 *
 * Exports: createPrepStore(), excludePathspecs().
 * Depends on: node:fs/promises, node:path, @forge/core (WorktreePrep), types/worktree-prep-store. IO: reads and writes one file.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { WorktreePrep } from '@forge/core';
import type { PrepStore } from '#/types/worktree-prep-store.types.js';

/** The store for the worktrees under `worktreeRoot`; a worktree's ticket id is its folder name. */
export function createPrepStore(worktreeRoot: string): PrepStore {
  const dir = join(worktreeRoot, '.forge-prep');
  const file = (root: string): string => join(dir, `${basename(root)}.json`);

  return {
    async read(root) {
      try {
        const parsed = WorktreePrep.safeParse(
          JSON.parse(await readFile(file(root), 'utf8')),
        );

        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },

    async write(root, prep) {
      await mkdir(dir, { recursive: true });
      await writeFile(file(root), `${JSON.stringify(prep, null, 2)}\n`, 'utf8');
    },

    async remove(root) {
      await rm(file(root), { force: true });
    },
  };
}

/**
 * Git pathspecs that leave recorded setup outputs out of a listing or an `add`: literal, so a
 * folder named `[x]` is not a glob. Trailing slashes are dropped; an empty list adds nothing.
 */
export function excludePathspecs(outputs: readonly string[]): string[] {
  return outputs.map((o) => `:(exclude,literal)${o.replace(/\/+$/, '')}`);
}
