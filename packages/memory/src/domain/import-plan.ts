/**
 * Import plan — decides, without touching anything, which files become which records.
 *
 * Why: bringing an old repository into the database must account for every file: each one becomes a record
 *   or is listed as refused with its reason, so the owner can see that nothing silently went missing. The
 *   plan is pure so the same files always give the same ids: an outcome note written by hand has no id and
 *   gets the next free `o-` number in path order (or the id an earlier attempt already gave that file), and
 *   a record id found in two files is refused for the second one rather than overwriting the first.
 *
 * Exports: planImport(), folderOf(), outcomeNumber().
 * Depends on: domain/lenient-record, types/memory-import. Pure, no IO.
 */

import { parseRecordText } from '#/domain/lenient-record.js';
import type {
  ImportPlan,
  PlannedRecord,
  RecordFolder,
  SourceFile,
} from '#/types/memory-import.types.js';

const FOLDERS: readonly RecordFolder[] = [
  'decisions',
  'rejected',
  'proposed',
  'outcomes',
];

/** The memory folder a path sits in, or null for a file outside the four folders. */
export function folderOf(relPath: string): RecordFolder | null {
  const first = relPath.split('/')[0];

  return FOLDERS.find((f) => f === first) ?? null;
}

/** The number in an `o-0007` id, or 0. */
export function outcomeNumber(id: string): number {
  const m = /^o-(\d{4})$/.exec(id);

  return m?.[1] === undefined ? 0 : Number(m[1]);
}

/**
 * `files` are the markdown files of one repository; `known` maps a path to the id an earlier import attempt
 * stored for it, so a second attempt reuses it.
 */
export function planImport(
  files: readonly SourceFile[],
  importedAt: string,
  known: ReadonlyMap<string, string> = new Map(),
): ImportPlan {
  const sorted = files
    .filter((f) => folderOf(f.relPath) !== null)
    .sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));

  const parsed: { path: string; id: string | null; record: PlannedRecord['record'] }[] =
    [];

  const rejects: { path: string; reason: string }[] = [];
  for (const file of sorted) {
    const folder = folderOf(file.relPath) as RecordFolder;
    const result = parseRecordText(file.text, {
      folder,
      relPath: file.relPath,
      importedAt,
    });

    if (result.ok) {
      parsed.push({ path: file.relPath, id: result.record.id, record: result.record });
    } else {
      rejects.push({ path: file.relPath, reason: result.reason });
    }
  }

  const used = new Set<string>([
    ...parsed.flatMap((p) => (p.id === null ? [] : [p.id])),
    ...known.values(),
  ]);

  let outcomes = Math.max(0, ...[...used].map(outcomeNumber));
  const first = new Map<string, string>();
  const records: PlannedRecord[] = [];

  for (const p of parsed) {
    let id = p.id;
    if (id === null) {
      id = known.get(p.path) ?? null;
    }

    if (id === null) {
      outcomes += 1;
      id = `o-${String(outcomes).padStart(4, '0')}`;
    }

    const clash = first.get(id);
    if (clash !== undefined) {
      rejects.push({ path: p.path, reason: `duplicate id ${id} (also in ${clash})` });
      continue;
    }

    first.set(id, p.path);
    records.push({ id, path: p.path, record: p.record });
  }

  return {
    files: sorted.length,
    records,
    rejects: rejects.sort((a, b) => (a.path < b.path ? -1 : 1)),
  };
}
