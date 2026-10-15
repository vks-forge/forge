/**
 * Loads a project's memory records from its working tree or from its last commit.
 *
 * Why: the writer plans each change from what is on disk, but everything that only reads
 *   (the API, the engine) must see committed state, or a write in flight shows it a torn
 *   one. Both paths parse the same way: a file that does not validate is reported and
 *   skipped, never trusted, and a record id found in two files is a typed error naming
 *   both, because after that nobody can say which copy is real.
 *
 * Exports: loadRecords(), loadCommittedRecords(), scanRecords(), assertUniqueIds().
 * Depends on: node:fs/promises, node:path, domain/record-file, shared/committed-files,
 *   shared/errors, types/project-memory. IO: files and `git` under one project's folder.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseRecordFile } from '#/domain/record-file.js';
import { readCommittedFiles } from '#/shared/committed-files.js';
import { MemoryIntegrityError } from '#/shared/errors.js';
import type { CommittedFile, OnSkip } from '#/types/git.types.js';
import type { MemoryFolder, StoredRecord } from '#/types/project-memory.types.js';

const FLAT_FOLDERS: readonly MemoryFolder[] = ['decisions', 'rejected', 'proposed'];
const ALL_FOLDERS: readonly MemoryFolder[] = [...FLAT_FOLDERS, 'outcomes'];

async function listMarkdown(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((n) => n.endsWith('.md')).sort();
  } catch {
    return [];
  }
}

async function treePaths(repoDir: string): Promise<string[]> {
  const relPaths: string[] = [];
  for (const folder of FLAT_FOLDERS) {
    const names = await listMarkdown(join(repoDir, folder));
    relPaths.push(...names.map((n) => `${folder}/${n}`));
  }

  let months: string[] = [];
  try {
    months = (await readdir(join(repoDir, 'outcomes'))).sort();
  } catch {
    months = [];
  }

  for (const month of months) {
    const names = await listMarkdown(join(repoDir, 'outcomes', month));
    relPaths.push(...names.map((n) => `outcomes/${month}/${n}`));
  }

  return relPaths;
}

async function readTree(repoDir: string, onSkip: OnSkip): Promise<CommittedFile[]> {
  const files: CommittedFile[] = [];
  for (const relPath of await treePaths(repoDir)) {
    const path = join(repoDir, ...relPath.split('/'));
    try {
      files.push({ relPath, text: await readFile(path, 'utf8') });
    } catch (error) {
      onSkip(
        path,
        `unreadable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return files;
}

function parseFiles(
  repoDir: string,
  files: readonly CommittedFile[],
  onSkip: OnSkip,
): StoredRecord[] {
  const found: StoredRecord[] = [];
  for (const file of files) {
    const parsed = parseRecordFile(file.text);
    if (!parsed.ok) {
      onSkip(join(repoDir, ...file.relPath.split('/')), parsed.reason);
      continue;
    }

    found.push({
      folder: file.relPath.split('/')[0] as MemoryFolder,
      relPath: file.relPath,
      record: parsed.record,
      body: parsed.body,
    });
  }

  return found;
}

/** Throws MemoryIntegrityError when two records share an id. */
export function assertUniqueIds(records: readonly StoredRecord[]): void {
  const seen = new Map<string, string>();
  for (const { record, relPath } of records) {
    const first = seen.get(record.id);
    if (first !== undefined) {
      throw new MemoryIntegrityError(record.id, [first, relPath]);
    }

    seen.set(record.id, relPath);
  }
}

/** Every valid record in the working tree, duplicates included; crash recovery needs to see them. */
export async function scanRecords(
  repoDir: string,
  onSkip: OnSkip,
): Promise<StoredRecord[]> {
  return parseFiles(repoDir, await readTree(repoDir, onSkip), onSkip);
}

/** Every valid record in the working tree, folder by folder, files in name order; ids are unique. */
export async function loadRecords(
  repoDir: string,
  onSkip: OnSkip,
): Promise<StoredRecord[]> {
  const records = await scanRecords(repoDir, onSkip);
  assertUniqueIds(records);

  return records;
}

/** Every valid record in the last commit; a repository with no commit has none. */
export async function loadCommittedRecords(
  repoDir: string,
  onSkip: OnSkip,
): Promise<StoredRecord[]> {
  const files = await readCommittedFiles(repoDir, ALL_FOLDERS);
  const records = parseFiles(repoDir, files, onSkip);
  assertUniqueIds(records);

  return records;
}
