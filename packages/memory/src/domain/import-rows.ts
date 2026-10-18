/**
 * Import rows — turns a planned record into the row, tags, links and history entry the database stores.
 *
 * Why: the importer and the markdown index (the CLI's local copy of this repository's own memory) both put
 *   parsed files into the same tables, and they must build the same row from the same file: statement and
 *   source exactly as read, the fields that had to be defaulted listed, the original header kept, and
 *   `imported_from` naming the file and the commit it was read at so the owner can trace any record back.
 *   One `imported` history entry per record says when and from where it came.
 *
 * Exports: toImportRows().
 * Depends on: types/memory-import. Pure, no IO.
 */

import type { ImportedRows, PlannedRecord } from '#/types/memory-import.types.js';

/** `sha` is the commit read (null for files read from a plain folder); `at` is the import time. */
export function toImportRows(
  project: string,
  p: PlannedRecord,
  sha: string | null,
  at: string,
): ImportedRows {
  const r = p.record;
  const importedFrom = sha === null ? p.path : `${p.path}@${sha}`;

  return {
    row: {
      project,
      id: p.id,
      kind: r.kind,
      status: r.status,
      statement: r.statement,
      body: r.body,
      source_type: r.source.type,
      source_ref: r.source.ref,
      author: r.author,
      origin: r.origin,
      confidence: r.confidence,
      created_at: r.created_at,
      valid_from: r.valid_from,
      valid_to: r.valid_to,
      superseded_by: r.superseded_by,
      pinned: r.pinned,
      approved_at: r.approved_at,
      approved_by: r.approved_by,
      rejected_at: r.rejected_at,
      rejected_by: r.rejected_by,
      rejected_reason: r.rejected_reason,
      gist: r.gist,
      aliases: [...r.aliases],
      imported_from: importedFrom,
      raw_front_matter: r.raw_front_matter,
      lenient_fields: r.defaulted.length === 0 ? null : [...r.defaulted],
    },
    tags: r.tags,
    links: r.links,
    event: {
      at,
      actor: 'import',
      event: 'imported',
      from_status: null,
      to_status: r.status,
      reason: importedFrom,
    },
  };
}
