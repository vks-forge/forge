/**
 * A project's memory repository on disk — create it, repair it, commit a change.
 *
 * Why: memory is markdown in a private git repository per project (d-0086), so the owner
 *   gets history, diff and revert for free and every Director write is an attributable
 *   commit. This module is the only place that changes that repository: it creates it on
 *   first use (new and pre-existing projects alike), repairs what a crashed write left
 *   behind so the next commit contains only its own change, and applies a planned change
 *   as atomic file writes followed by exactly one commit.
 *
 * Exports: ensureRepo(), recoverRepo(), applyChange().
 * Depends on: node:fs/promises, node:path, adapters/git-project-memory/records,
 *   domain/memory-index, shared/git, shared/committed-files, shared/atomic-write,
 *   types/project-memory. IO: files and `git` under one project's folder.
 */

import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadRecords, scanRecords } from '#/adapters/git-project-memory/records.js';
import { buildMemoryIndex } from '#/domain/memory-index.js';
import { removeFile, writeFileAtomic } from '#/shared/atomic-write.js';
import { hasCommit } from '#/shared/committed-files.js';
import { runGit } from '#/shared/git.js';
import type { OnSkip } from '#/types/git.types.js';
import type {
  IndexEntry,
  MemoryFolder,
  PlannedChange,
  StoredRecord,
} from '#/types/project-memory.types.js';

const INIT_SUBJECT = 'memory: initialise repository';

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);

    return true;
  } catch {
    return false;
  }
}

const entryOf = (r: StoredRecord): IndexEntry => ({
  id: r.record.id,
  statement: r.record.statement,
  relPath: r.relPath,
});

/** Renders MEMORY.md from the records now on disk. */
async function indexText(slug: string, repoDir: string, onSkip: OnSkip): Promise<string> {
  const all = await loadRecords(repoDir, onSkip);
  const inFolder = (f: MemoryFolder, status?: string) =>
    all
      .filter(
        (r) => r.folder === f && (status === undefined || r.record.status === status),
      )
      .map(entryOf);

  return buildMemoryIndex({
    slug,
    decisions: inFolder('decisions', 'active'),
    rejected: inFolder('rejected'),
    proposed: inFolder('proposed', 'pending'),
    superseded: all.filter(
      (r) => r.folder === 'decisions' && r.record.status === 'superseded',
    ).length,
    outcomes: inFolder('outcomes'),
  });
}

async function writeIndex(slug: string, repoDir: string, onSkip: OnSkip): Promise<void> {
  await writeFileAtomic(
    repoDir,
    join(repoDir, 'MEMORY.md'),
    await indexText(slug, repoDir, onSkip),
  );
}

async function commitAll(repoDir: string, subject: string): Promise<string> {
  await runGit(repoDir, ['add', '-A']);
  await runGit(repoDir, ['commit', '-q', '--no-verify', '-m', subject]);

  return runGit(repoDir, ['rev-parse', 'HEAD']);
}

/**
 * Makes `repoDir` a git repository with an index and one initial commit. An existing
 * repository is left alone, except one with no commit yet (a crash between `git init`
 * and the first commit), which is finished.
 */
export async function ensureRepo(
  slug: string,
  repoDir: string,
  onSkip: OnSkip,
): Promise<void> {
  if (await exists(join(repoDir, '.git'))) {
    if (!(await hasCommit(repoDir))) {
      await writeIndex(slug, repoDir, onSkip);
      await commitAll(repoDir, INIT_SUBJECT);
    }

    return;
  }

  await mkdir(repoDir, { recursive: true });
  await runGit(repoDir, ['init', '-q', '-b', 'main']);
  await writeIndex(slug, repoDir, onSkip);
  await commitAll(repoDir, INIT_SUBJECT);
}

/**
 * Brings a repository that a crashed write left dirty back to a state where exactly one
 * commit can follow. A move whose new file landed while the proposal copy still exists is
 * completed (the destination wins, the proposal goes, a "recover: complete" commit records
 * it). Anything else, staged or not, is thrown away back to the last commit, because an
 * unfinished write was never acknowledged to its caller.
 */
export async function recoverRepo(
  slug: string,
  repoDir: string,
  onSkip: OnSkip,
): Promise<void> {
  if ((await runGit(repoDir, ['status', '--porcelain'])) === '') {
    return;
  }

  const all = await scanRecords(repoDir, onSkip);
  const settled = new Set(
    all
      .filter((r) => r.folder === 'decisions' || r.folder === 'rejected')
      .map((r) => r.record.id),
  );

  const stale = all.filter((r) => r.folder === 'proposed' && settled.has(r.record.id));
  if (stale.length === 0) {
    await runGit(repoDir, ['reset', '-q', '--hard', 'HEAD']);
    await runGit(repoDir, ['clean', '-fdq']);

    return;
  }

  for (const r of stale) {
    await removeFile(join(repoDir, ...r.relPath.split('/')));
  }

  await writeIndex(slug, repoDir, onSkip);
  const ids = [...new Set(stale.map((r) => r.record.id))].join(', ');
  await commitAll(repoDir, `recover: complete ${ids}`);
}

/**
 * Applies a planned change: writes and deletes files atomically, rewrites MEMORY.md from the
 * result, and makes one commit. Returns the commit sha.
 */
export async function applyChange(
  slug: string,
  repoDir: string,
  change: PlannedChange,
  onSkip: OnSkip,
): Promise<string> {
  for (const [relPath, text] of change.write) {
    await writeFileAtomic(repoDir, join(repoDir, ...relPath.split('/')), text);
  }

  for (const relPath of change.remove) {
    await removeFile(join(repoDir, ...relPath.split('/')));
  }

  await writeIndex(slug, repoDir, onSkip);

  return commitAll(repoDir, change.subject);
}
