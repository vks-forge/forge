/**
 * Export rendering — a project's memory as the markdown files the old repository held.
 *
 * Why: the database is the home of project memory, but the owner can still read it, diff it and review it as
 *   plain files, and the mirror of a project's memory into its repository (d-0086) reads exactly this layout.
 *   The files are a pure function of the rows: the same records give the same bytes, with no clock inside, so
 *   two exports of an unchanged memory are identical and a diff shows only real changes. Each file uses the
 *   same header the writer always used (the existing codec), so it parses back to the record it came from;
 *   `MEMORY.md` is the generated one-screen index and never passes its line budget.
 *
 * Exports: renderExport(), exportPathOf(), rowToRecord().
 * Depends on: @forge/core, domain/memory-index, domain/record-file, types/memory-import, types/project-memory. Pure, no IO.
 */

import type { MemoryLinkRow, MemoryRecord, MemoryRow } from '@forge/core';
import { buildMemoryIndex } from '#/domain/memory-index.js';
import { recordFileName, renderRecordFile } from '#/domain/record-file.js';
import type { ExportFile, ExportInput } from '#/types/memory-import.types.js';
import type { IndexEntry } from '#/types/project-memory.types.js';

const FOLDER = {
  decision: 'decisions',
  rejected: 'rejected',
  proposal: 'proposed',
  outcome: 'outcomes',
} as const;

/** The path of a record's file inside an export: `decisions/d-0001-words.md`, outcomes under `outcomes/YYYY-MM/`. */
export function exportPathOf(row: MemoryRow): string {
  const name = recordFileName(row.id, row.statement);
  if (row.kind !== 'outcome') {
    return `${FOLDER[row.kind]}/${name}`;
  }

  const month = /^\d{4}-\d{2}/.exec(row.created_at)?.[0] ?? '0000-00';

  return `outcomes/${month}/${name}`;
}

const ids = (links: readonly MemoryLinkRow[], rel: string): string[] =>
  links.filter((l) => l.rel === rel && l.target_kind === 'record').map((l) => l.target);

/** The row as the record codec writes it: only what is set, in the codec's order. */
export function rowToRecord(
  row: MemoryRow,
  tags: readonly string[],
  links: readonly MemoryLinkRow[],
): MemoryRecord {
  const supersedes = ids(links, 'supersedes')[0];
  const extra: Record<string, unknown> = {};
  for (const rel of ['amends', 'reopens', 'cites'] as const) {
    const list = ids(links, rel);
    if (list.length > 0) {
      extra[rel] = list;
    }
  }

  const card = links.find((l) => l.rel === 'card')?.target;
  const ticket = links.find((l) => l.rel === 'ticket')?.target;

  return {
    id: row.id,
    kind: row.kind,
    statement: row.statement,
    source: { type: row.source_type, ref: row.source_ref },
    author: row.author,
    origin: row.origin,
    status: row.status,
    valid_from: row.valid_from,
    ...(row.valid_to === null ? {} : { valid_to: row.valid_to }),
    ...(row.superseded_by === null ? {} : { superseded_by: row.superseded_by }),
    ...(supersedes === undefined ? {} : { supersedes }),
    ...(row.approved_at === null ? {} : { approved_at: row.approved_at }),
    ...(row.approved_by === null ? {} : { approved_by: row.approved_by }),
    ...(row.rejected_at === null ? {} : { rejected_at: row.rejected_at }),
    ...(row.rejected_by === null ? {} : { rejected_by: row.rejected_by }),
    ...(row.rejected_reason === null ? {} : { rejected_reason: row.rejected_reason }),
    ...(row.confidence === null ? {} : { confidence: row.confidence }),
    tags: [...tags],
    pinned: row.pinned,
    ...(row.gist === null ? {} : { gist: row.gist }),
    ...(row.aliases.length === 0 ? {} : { aliases: [...row.aliases] }),
    ...extra,
    ...(card === undefined ? {} : { card }),
    ...(ticket === undefined ? {} : { ticket }),
  };
}

/** Every record file and the generated `MEMORY.md`, sorted by path. */
export function renderExport(input: ExportInput): ExportFile[] {
  const files: ExportFile[] = [];
  const entries: Record<
    'decisions' | 'rejected' | 'proposed' | 'outcomes',
    IndexEntry[]
  > = {
    decisions: [],
    rejected: [],
    proposed: [],
    outcomes: [],
  };

  let superseded = 0;
  for (const row of [...input.rows].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const path = exportPathOf(row);
    files.push({
      relPath: path,
      text: renderRecordFile(
        rowToRecord(row, input.tags[row.id] ?? [], input.links[row.id] ?? []),
        row.body,
      ),
    });

    const entry = { id: row.id, statement: row.statement, relPath: path };
    if (row.kind === 'decision' && row.status === 'active') {
      entries.decisions.push(entry);
    } else if (row.kind === 'decision') {
      superseded += 1;
    } else if (row.kind === 'rejected') {
      entries.rejected.push(entry);
    } else if (row.kind === 'proposal' && row.status === 'pending') {
      entries.proposed.push(entry);
    } else if (row.kind === 'outcome') {
      entries.outcomes.push(entry);
    }
  }

  files.push({
    relPath: 'MEMORY.md',
    text: buildMemoryIndex({ slug: input.project, ...entries, superseded }),
  });

  return files.sort((a, b) =>
    a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0,
  );
}
