/**
 * Record file codec — renders a memory record to markdown and reads one back.
 *
 * Why: the writer must put exactly the fields the owner approved on disk in a stable order
 *   (so a git diff of a status change shows one or two lines) and must read a file back
 *   without losing hand-added fields or half-trusting a malformed one. Statements often
 *   hold colons, quotes or line breaks, so the YAML is produced by a real serializer, never
 *   by string concatenation, and a file that does not validate is reported, not repaired.
 *
 * Exports: renderRecordFile(), parseRecordFile(), recordFileName().
 * Depends on: yaml, @forge/core (MemoryRecord), domain/front-matter, types/project-memory.
 *   Pure, no IO.
 */

import { MemoryRecord } from '@forge/core';
import { stringify } from 'yaml';
import { bodyOf, parseFrontMatter } from '#/domain/front-matter.js';
import type { RecordFileResult } from '#/types/project-memory.types.js';

/** Field order on disk; unknown fields follow in their original order. */
const FIELD_ORDER = [
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
] as const;

/** `---` fenced YAML header, a blank line, then the markdown body (omitted when empty). */
export function renderRecordFile(record: MemoryRecord, body: string): string {
  const source = record as Record<string, unknown>;
  const ordered: Record<string, unknown> = {};
  for (const key of FIELD_ORDER) {
    if (source[key] !== undefined) {
      ordered[key] = source[key];
    }
  }

  for (const key of Object.keys(source)) {
    if (!(key in ordered) && source[key] !== undefined) {
      ordered[key] = source[key];
    }
  }

  const yaml = stringify(ordered, { lineWidth: 0 });
  const text = body.trim();

  return `---\n${yaml}---\n${text === '' ? '' : `\n${text}\n`}`;
}

/** Parses a record file; any problem (no header, bad YAML, a field that fails the schema) is a reason. */
export function parseRecordFile(text: string): RecordFileResult {
  const fm = parseFrontMatter(text);
  if (!fm.ok) {
    return { ok: false, reason: fm.reason };
  }

  const parsed = MemoryRecord.safeParse(fm.data);
  if (!parsed.success) {
    return {
      ok: false,
      reason: parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    };
  }

  return { ok: true, record: parsed.data, body: bodyOf(text).trimEnd() };
}

/** `x-0001-short-words-of-the-statement.md`: readable in a file listing, stable once written. */
export function recordFileName(id: string, statement: string): string {
  const slug = statement
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');

  return slug === '' ? `${id}.md` : `${id}-${slug}.md`;
}
