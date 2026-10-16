/**
 * Counts what a snapshot commit of a folder with no repository would take in.
 *
 * Why: the first snapshot of a project folder is an irreversible-feeling step for the user
 *   (their files become a commit) and a runaway one when the folder holds a dependency tree
 *   or a data dump. Onboarding shows the file count and size before it asks, and the same
 *   guard refuses a snapshot above the limit, telling the user to add ignores first. The
 *   count must match what `git add -A` would stage, so it asks git itself: `ls-files
 *   --others --exclude-standard` against a throwaway git dir, so nothing is written to the
 *   user's folder. When the folder has no `.gitignore`, the standard ignore list Forge would
 *   write is applied as the excludes file, so the number is the one after that file exists.
 *
 * Exports: scanSnapshot(), STANDARD_GITIGNORE, DEFAULT_SNAPSHOT_LIMITS.
 * Depends on: node:fs, node:os, node:path, @forge/core (SnapshotInspection),
 *   adapters/git-cli/run-git. IO: runs git, stats files, uses a temp folder.
 */

import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { SnapshotInspection } from '@forge/core';
import { createGitRunner } from '#/adapters/git-cli/run-git.js';
import type { SnapshotScanOptions, SnapshotLimits } from '#/types/folder-git.types.js';

export const DEFAULT_SNAPSHOT_LIMITS: SnapshotLimits = {
  maxFiles: 20_000,
  maxBytes: 1024 * 1024 * 1024,
};

/** What Forge writes into a folder that has no `.gitignore`. */
export const STANDARD_GITIGNORE = `# Added by Forge before the first snapshot commit.
node_modules/
dist/
build/
out/
.env
.env.*
*.log
.DS_Store
Thumbs.db
.venv/
venv/
__pycache__/
*.pyc
target/
bin/
obj/
`;

/** Counts files and bytes a snapshot would stage; stops counting once a limit is passed. */
export async function scanSnapshot(
  opts: SnapshotScanOptions,
): Promise<SnapshotInspection> {
  const git = createGitRunner(opts.gitBinary ?? 'git');
  const limits = opts.limits ?? DEFAULT_SNAPSHOT_LIMITS;
  const path = resolve(opts.path);
  const hasIgnore = existsSync(join(path, '.gitignore'));
  const scratch = mkdtempSync(join(tmpdir(), 'forge-scan-'));

  try {
    const gitDir = join(scratch, 'git');
    await git.run(scratch, ['init', '--bare', '--quiet', gitDir]);
    const excludes = join(scratch, 'excludes');
    writeFileSync(excludes, hasIgnore ? '' : STANDARD_GITIGNORE);

    let listed: string;
    try {
      listed = await git.run(path, [
        `--git-dir=${gitDir}`,
        `--work-tree=${path}`,
        '-c',
        `core.excludesFile=${excludes}`,
        'ls-files',
        '--others',
        '--exclude-standard',
        '-z',
      ]);
    } catch {
      // Output past the buffer means far more files than any sane limit.
      return {
        files: limits.maxFiles + 1,
        bytes: 0,
        has_gitignore: hasIgnore,
        truncated: true,
      };
    }

    const names = listed.split('\0').filter((n) => n !== '');
    let bytes = 0;
    let files = 0;
    for (const name of names) {
      files++;
      try {
        const st = statSync(join(path, name));
        bytes += st.isFile() ? st.size : 0;
      } catch {
        // A file that vanished or is a broken link adds nothing.
      }

      if (files > limits.maxFiles || bytes > limits.maxBytes) {
        return { files, bytes, has_gitignore: hasIgnore, truncated: true };
      }
    }

    return { files, bytes, has_gitignore: hasIgnore, truncated: false };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
