/**
 * Lenient record parser — turns an old memory record file into a record without losing a word.
 *
 * Why: the markdown files of earlier versions were written by hand and by several writers. Moving memory into
 *   the database must keep every record the Director plans against, and must never believe more than the
 *   file said: a missing status is `pending` (not in force), a missing author is the Director (an inference,
 *   not an owner decision), a missing origin is `agent`, and every field it had to fill or recover from raw
 *   text is listed so the owner can see it. The statement is kept byte for byte; the original header is kept
 *   when anything was odd. Only a file with no id (outside outcomes) or no statement is refused, because
 *   such a record cannot be cited or applied. Outcome notes written by hand have neither header nor id, so
 *   they get a statement from their session or first line and the importer gives them the next `o-` id.
 *
 * Exports: parseRecordText().
 * Depends on: @forge/core, domain/lenient-header, domain/record-fields, types/memory-import. Pure, no IO.
 */

import { MEMORY_ID_PATTERN, MemoryAuthor, MemoryOrigin } from '@forge/core';
import type { MemoryKind } from '@forge/core';
import { readHeader } from '#/domain/lenient-header.js';
import {
  firstLine,
  isOneOf,
  linksOf,
  outcomeDate,
  sourceOf,
  statusOf,
  tagsOf,
  text,
} from '#/domain/record-fields.js';
import type {
  ImportedRecord,
  ParseContext,
  ParsedRecordFile,
  RecordFolder,
} from '#/types/memory-import.types.js';

const KIND_OF_FOLDER: Record<RecordFolder, MemoryKind> = {
  decisions: 'decision',
  rejected: 'rejected',
  proposed: 'proposal',
  outcomes: 'outcome',
};

const KNOWN_KEYS = new Set([
  'id',
  'kind',
  'statement',
  'source',
  'author',
  'origin',
  'status',
  'valid_from',
  'valid_to',
  'superseded_by',
  'supersedes',
  'approved_at',
  'approved_by',
  'rejected_at',
  'rejected_by',
  'rejected_reason',
  'confidence',
  'tags',
  'pinned',
  'amends',
  'reopens',
  'cites',
  'card',
  'ticket',
  'gist',
  'aliases',
  'date',
  'session',
]);

/** Parses one record file; the result carries every field filled and the names of those it had to default. */
export function parseRecordText(file: string, ctx: ParseContext): ParsedRecordFile {
  const read = readHeader(file);
  if (!read.ok) {
    return read;
  }

  const isOutcome = ctx.folder === 'outcomes';
  if (!read.hasFrontMatter && !isOutcome) {
    return { ok: false, reason: 'no front matter' };
  }

  const { data, recovered } = read.header;
  const defaulted: string[] = [
    ...recovered.filter((k) => k !== 'source' && k !== 'tags'),
  ];

  const wasRecovered = (k: string): boolean => recovered.includes(k);

  const id: string | null = text(data['id'])?.trim() ?? null;
  if (id === null && !isOutcome) {
    return { ok: false, reason: 'no id' };
  }

  if (id !== null && !MEMORY_ID_PATTERN.test(id)) {
    return { ok: false, reason: `id ${id} does not look like d-0001` };
  }

  if (id === null) {
    defaulted.push('id');
  }

  let statement = text(data['statement']);
  if (statement === null && isOutcome) {
    statement = text(data['session'])?.trim() ?? (firstLine(read.body) || null);
    if (statement !== null) {
      defaulted.push('statement');
    }
  }

  if (statement === null) {
    return { ok: false, reason: 'no statement' };
  }

  // The folder decides the kind: the file adapter treated a record in decisions/ as a decision whatever
  // word its header carried (an approved proposal kept `proposal` or the old `proposed`), and the import
  // must not turn such a decision into a proposal that no longer constrains anything.
  const kind = KIND_OF_FOLDER[ctx.folder];
  if (data['kind'] !== kind && !(isOutcome && data['kind'] === undefined)) {
    defaulted.push('kind');
  }

  const status = statusOf(data['status'], kind, defaulted);

  const authorWritten = isOneOf(MemoryAuthor.options, data['author']);
  if (!authorWritten && !isOutcome) {
    defaulted.push('author');
  }

  const originWritten = isOneOf(MemoryOrigin.options, data['origin']);
  if (!originWritten && !isOutcome) {
    defaulted.push('origin');
  }

  let validFrom = text(data['valid_from'])?.trim() ?? null;
  if (validFrom === null && isOutcome) {
    validFrom = outcomeDate(data, ctx.relPath);
  }

  if (validFrom === null) {
    validFrom = ctx.importedAt;
    defaulted.push('valid_from');
  }

  let confidence: number | null = null;
  if (
    typeof data['confidence'] === 'number' &&
    data['confidence'] >= 0 &&
    data['confidence'] <= 1
  ) {
    confidence = data['confidence'];
  } else if (data['confidence'] !== undefined && data['confidence'] !== null) {
    defaulted.push('confidence');
  }

  const gist = text(data['gist'])?.trim().slice(0, 160) ?? null;
  const aliases = Array.isArray(data['aliases'])
    ? data['aliases']
        .filter((a): a is string => typeof a === 'string' && a.trim() !== '')
        .map((a) => a.trim().slice(0, 40))
        .slice(0, 8)
    : [];

  const source = sourceOf(
    data['source'],
    wasRecovered('source'),
    ctx,
    isOutcome,
    defaulted,
  );

  const tags = tagsOf(data['tags'], wasRecovered('tags'), defaulted);
  const unknown = Object.keys(data).some((k) => !KNOWN_KEYS.has(k));
  const unique = [...new Set(defaulted)];
  const clean = read.header.strict && unique.length === 0 && !unknown;

  const record: ImportedRecord = {
    id,
    kind,
    status,
    statement,
    body: read.body,
    source,
    author: authorWritten ? (data['author'] as MemoryAuthor) : 'director',
    origin: originWritten
      ? (data['origin'] as MemoryOrigin)
      : isOutcome
        ? 'system'
        : 'agent',
    confidence,
    created_at: Number.isNaN(Date.parse(validFrom)) ? ctx.importedAt : validFrom,
    valid_from: validFrom,
    valid_to: text(data['valid_to'])?.trim() ?? null,
    superseded_by: text(data['superseded_by'])?.trim() ?? null,
    pinned: data['pinned'] === true,
    approved_at: text(data['approved_at'])?.trim() ?? null,
    approved_by: text(data['approved_by'])?.trim() ?? null,
    rejected_at: text(data['rejected_at'])?.trim() ?? null,
    rejected_by: text(data['rejected_by'])?.trim() ?? null,
    rejected_reason: text(data['rejected_reason'])?.trim() ?? null,
    gist,
    aliases,
    tags,
    links: linksOf(data, read.body, id),
    defaulted: unique,
    raw_front_matter: clean || !read.hasFrontMatter ? null : read.header.text,
    lenient: !read.header.strict,
  };

  return { ok: true, record };
}
