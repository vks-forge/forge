/**
 * A project's memory repository on disk — create it, read every record, commit a change.
 *
 * Why: memory is markdown in a private git repository per project (d-0086), so the owner
 *   gets history, diff and revert for free and every Director write is an attributable
 *   commit. This module is the only place that touches that repository: it creates it on
 *   first use (new and pre-existing projects alike), loads the valid records of the four
 *   folders (reporting, never trusting, a file that does not validate), and applies a
 *   planned change as atomic file writes followed by exactly one commit.
 *
 * Exports: ensureRepo(), loadRecords(), applyChange().
 * Depends on: node:fs/promises, node:path, @forge/core, domain/record-file,
 *   domain/memory-index, shared/git, shared/atomic-write, types/project-memory.
 *   IO: files and `git` under one project's folder.
 */

import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { buildMemoryIndex } from '#/domain/memory-index.js';
import { parseRecordFile } from '#/domain/record-file.js';
import { removeFile, writeFileAtomic } from '#/shared/atomic-write.js';
import { runGit } from '#/shared/git.js';
import type {
  IndexEntry,
  MemoryFolder,
  PlannedChange,
  StoredRecord,
} from '#/types/project-memory.types.js';

const FLAT_FOLDERS: readonly MemoryFolder[] = ['decisions', 'rejected', 'proposed'];

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);

    return true;
  } catch {
    return false;
  }
}

async function listMarkdown(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((n) => n.endsWith('.md')).sort();
  } catch {
    return [];
  }
}

async function readRecord(
  repoDir: string,
  folder: MemoryFolder,
  relPath: string,
  onSkip: (path: string, reason: string) => void,
): Promise<StoredRecord | null> {
  const path = join(repoDir, ...relPath.split('/'));
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    onSkip(path, `unreadable: ${error instanceof Error ? error.message : String(error)}`);

    return null;
  }

  const parsed = parseRecordFile(text);
  if (!parsed.ok) {
    onSkip(path, parsed.reason);

    return null;
  }

  return { folder, relPath, record: parsed.record, body: parsed.body };
}

/** Every valid record under `repoDir`, folder by folder, files in name order. */
export async function loadRecords(
  repoDir: string,
  onSkip: (path: string, reason: string) => void,
): Promise<StoredRecord[]> {
  const found: StoredRecord[] = [];
  for (const folder of FLAT_FOLDERS) {
    for (const name of await listMarkdown(join(repoDir, folder))) {
      const rec = await readRecord(repoDir, folder, `${folder}/${name}`, onSkip);
      if (rec) {
        found.push(rec);
      }
    }
  }

  let months: string[] = [];
  try {
    months = (await readdir(join(repoDir, 'outcomes'))).sort();
  } catch {
    months = [];
  }

  for (const month of months) {
    for (const name of await listMarkdown(join(repoDir, 'outcomes', month))) {
      const rec = await readRecord(
        repoDir,
        'outcomes',
        `outcomes/${month}/${name}`,
        onSkip,
      );

      if (rec) {
        found.push(rec);
      }
    }
  }

  return found;
}

const entryOf = (r: StoredRecord): IndexEntry => ({
  id: r.record.id,
  statement: r.record.statement,
  relPath: r.relPath,
});

/** Renders MEMORY.md from the records now on disk. */
async function indexText(
  slug: string,
  repoDir: string,
  onSkip: (path: string, reason: string) => void,
): Promise<string> {
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

async function commitAll(repoDir: string, subject: string): Promise<string> {
  await runGit(repoDir, ['add', '-A']);
  await runGit(repoDir, ['commit', '-q', '--no-verify', '-m', subject]);

  return runGit(repoDir, ['rev-parse', 'HEAD']);
}

/**
 * Makes `repoDir` a git repository with an index and one initial commit when it is not one
 * yet. Returns without touching an existing repository.
 */
export async function ensureRepo(
  slug: string,
  repoDir: string,
  onSkip: (path: string, reason: string) => void,
): Promise<void> {
  if (await exists(join(repoDir, '.git'))) {
    return;
  }

  await mkdir(repoDir, { recursive: true });
  await runGit(repoDir, ['init', '-q', '-b', 'main']);
  await writeFileAtomic(
    repoDir,
    join(repoDir, 'MEMORY.md'),
    await indexText(slug, repoDir, onSkip),
  );

  await commitAll(repoDir, 'memory: initialise repository');
}

/**
 * Applies a planned change: writes and deletes files atomically, rewrites MEMORY.md from the
 * result, and makes one commit. Returns the commit sha.
 */
export async function applyChange(
  slug: string,
  repoDir: string,
  change: PlannedChange,
  onSkip: (path: string, reason: string) => void,
): Promise<string> {
  for (const [relPath, text] of change.write) {
    await writeFileAtomic(repoDir, join(repoDir, ...relPath.split('/')), text);
  }

  for (const relPath of change.remove) {
    await removeFile(join(repoDir, ...relPath.split('/')));
  }

  await writeFileAtomic(
    repoDir,
    join(repoDir, 'MEMORY.md'),
    await indexText(slug, repoDir, onSkip),
  );

  return commitAll(repoDir, change.subject);
}
