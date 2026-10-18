/**
 * Row mapping for the memory tables: columns to `MemoryRow` and back.
 *
 * Why: the memory repositories (records, search, links, log) all read the same row shape, and a column
 *   written one way and read another would silently change what a Worker is told. The conversions live in
 *   one place: booleans as 0 / 1, `aliases` joined with a newline (readable by the full-text index as
 *   separate words and lossless for an alias made of two words), `lenient_fields` as a JSON list, and
 *   every row parsed with the core schema so a value this version cannot read fails closed.
 *
 * Exports: ALIAS_SEPARATOR, joinAliases(), toMemoryRow(), recordColumns(), RECORD_COLUMNS, RECORD_COLUMN_COUNT, sha256Hex().
 * Depends on: @forge/core, node:crypto, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { createHash } from 'node:crypto';
import { MemoryRow } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { fromJson } from '#/shared/json.js';
import type { SqlRow } from '#/types/storage-driver.types.js';

export const ALIAS_SEPARATOR = '\n';

export const joinAliases = (aliases: readonly string[]): string =>
  aliases.join(ALIAS_SEPARATOR);

const splitAliases = (text: unknown): string[] =>
  typeof text === 'string' ? text.split(ALIAS_SEPARATOR).filter((a) => a !== '') : [];

const COLUMNS = [
  'project',
  'id',
  'kind',
  'status',
  'statement',
  'body',
  'source_type',
  'source_ref',
  'author',
  'origin',
  'confidence',
  'created_at',
  'valid_from',
  'valid_to',
  'superseded_by',
  'pinned',
  'approved_at',
  'approved_by',
  'rejected_at',
  'rejected_by',
  'rejected_reason',
  'gist',
  'aliases',
  'imported_from',
  'raw_front_matter',
  'lenient_fields',
] as const;

/** The columns of `memory_records` the repositories select, optionally qualified by a table alias. */
export const recordColumns = (alias?: string): string =>
  COLUMNS.map((c) => (alias === undefined ? c : `${alias}.${c}`)).join(', ');

export const RECORD_COLUMNS = recordColumns();
export const RECORD_COLUMN_COUNT = COLUMNS.length;

export function toMemoryRow(row: SqlRow): MemoryRow {
  return parseStored(
    MemoryRow,
    {
      ...row,
      pinned: row['pinned'] === 1,
      aliases: splitAliases(row['aliases']),
      lenient_fields: fromJson(row['lenient_fields']),
    },
    'memory record',
  );
}

export const sha256Hex = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');
