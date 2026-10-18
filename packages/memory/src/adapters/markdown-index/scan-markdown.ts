/**
 * Scans a plain memory folder (no git) and loads it into a storage as records.
 *
 * Why: this repository's own `.forge/memory` stays markdown in git, but it gets the same search as the product
 *   so a session reads a few relevant records instead of every file. The folder is read like an old
 *   repository (the same lenient parser, so no record of the 36 whose headers strict YAML rejects is lost),
 *   and a manifest of size, modification time and content hash per file tells the caller whether anything
 *   changed since the index was built: only files whose size or time differ are hashed, and an index is
 *   reused when every file is unchanged. The storage the caller hands in is filled whole, because stored
 *   records can never be updated in place: a changed folder means a new index file, built aside and swapped in
 *   by the caller. Nothing is written to the folder.
 *
 * Exports: scanMarkdown(), loadMarkdownInto(), readMarkdownFiles().
 * Depends on: node:fs/promises, node:path, node:crypto, @forge/core, domain/import-plan, domain/import-rows,
 *   types/markdown-index. IO: reads the folder.
 */

import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { MemoryImportStatus, StorageAdapter } from '@forge/core';
import { planImport } from '#/domain/import-plan.js';
import { toImportRows } from '#/domain/import-rows.js';
import type { SourceFile } from '#/types/memory-import.types.js';
import type {
  MarkdownManifest,
  MarkdownScan,
  ManifestEntry,
} from '#/types/markdown-index.types.js';

const FOLDERS = ['decisions', 'rejected', 'proposed', 'outcomes'] as const;

async function walk(dir: string, rel: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(join(dir, rel), { withFileTypes: true });
  } catch {
    return;
  }

  for (const e of entries) {
    const next = rel === '' ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) {
      await walk(dir, next, out);
    } else if (e.name.endsWith('.md')) {
      out.push(next);
    }
  }
}

/** The record files of the four folders, as paths relative to `dir`, sorted. */
async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const folder of FOLDERS) {
    await walk(dir, folder, out);
  }

  return out.sort();
}

const sha = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

/** The text of every record file, in path order. */
export async function readMarkdownFiles(dir: string): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  for (const relPath of await listFiles(dir)) {
    files.push({
      relPath,
      text: await readFile(join(dir, ...relPath.split('/')), 'utf8'),
    });
  }

  return files;
}

/**
 * Compares the folder with the manifest of the last build. Files whose size and time match keep their stored
 * hash; the others are hashed. `changed` is true when a file was added, removed or its content differs.
 */
export async function scanMarkdown(
  dir: string,
  previous: MarkdownManifest | null,
): Promise<MarkdownScan> {
  const before = new Map((previous?.files ?? []).map((f) => [f.path, f]));
  const files: ManifestEntry[] = [];
  let changed = previous === null;
  for (const path of await listFiles(dir)) {
    const full = join(dir, ...path.split('/'));
    const s = await stat(full);
    const old = before.get(path);
    if (old !== undefined && old.size === s.size && old.mtimeMs === s.mtimeMs) {
      files.push(old);
      continue;
    }

    const hash = sha(await readFile(full, 'utf8'));
    changed = changed || old === undefined || old.sha256 !== hash;
    files.push({ path, size: s.size, mtimeMs: s.mtimeMs, sha256: hash });
  }

  changed = changed || files.length !== before.size;

  return { manifest: { version: 1, files }, changed };
}

/** Plans and stores every record of the folder into an empty `storage` under `project`; reports like an import. */
export async function loadMarkdownInto(
  storage: StorageAdapter,
  dir: string,
  project: string,
  now: Date,
): Promise<MemoryImportStatus> {
  const at = now.toISOString();
  const plan = planImport(await readMarkdownFiles(dir), at.slice(0, 10));
  await storage.transaction(async (tx) => {
    for (const p of plan.records) {
      const rows = toImportRows(project, p, null, at);
      await tx.memory.insertRecord(rows.row, rows.tags, rows.links, rows.event);
    }

    await tx.memory.reindex(project);
  });

  return {
    state: plan.rejects.length === 0 ? 'verified' : 'needs_attention',
    head_sha: null,
    files: plan.files,
    imported: plan.records.length,
    lenient: plan.records.filter((p) => p.record.lenient || p.record.defaulted.length > 0)
      .length,
    rejects: [...plan.rejects],
    verified_at: plan.rejects.length === 0 ? at : null,
    backup_path: null,
    repo_deleted_at: null,
    message:
      plan.rejects.length === 0
        ? null
        : `${plan.rejects.length} file(s) could not be read`,
  };
}
