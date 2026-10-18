/**
 * Record fields — the small rules that turn one parsed header value into a safe typed field.
 *
 * Why: the lenient parser fills a record from a header that may be missing fields or hold the wrong type, and
 *   each field has its own safe answer: a tag is cut to the words the search index accepts, a source that
 *   did not parse keeps its raw text as an `imported` source, a missing status is `pending` (never `active`),
 *   a rejected approach is always in force, and a link is only a record id found in the text. Keeping these
 *   rules one function each means the parser reads as a list of fields and every default is listed where it
 *   is made, so the owner is told exactly which fields were filled in.
 *
 * Exports: isOneOf(), text(), normaliseTag(), extractRecordIds(), tagsOf(), firstLine(), sourceOf(), statusOf(),
 *   linksOf(), outcomeDate().
 * Depends on: @forge/core, types/memory-import. Pure, no IO.
 */

import { MemoryStatus } from '@forge/core';
import type { MemoryKind, MemoryLink } from '@forge/core';
import type { ParseContext } from '#/types/memory-import.types.js';

const ID_IN_TEXT = /\b[a-z]-\d{4}\b/g;
const STATEMENT_MAX = 200;

export const isOneOf = <T extends string>(options: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (options as readonly string[]).includes(v);

export const text = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v : null;

/** A tag as the search index accepts it: lower case, `a-z 0-9 . _ -`, at most 40 characters. */
export function normaliseTag(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Every record id (`d-0012`) written in a value, in order, once. */
export function extractRecordIds(value: unknown): string[] {
  const parts = Array.isArray(value) ? value : [value];
  const ids = parts.flatMap((p) =>
    typeof p === 'string' ? (p.match(ID_IN_TEXT) ?? []) : [],
  );

  return [...new Set(ids)];
}

export function tagsOf(
  value: unknown,
  recovered: boolean,
  defaulted: string[],
): string[] {
  let raw: string[] = [];
  if (recovered) {
    defaulted.push('tags');
  } else if (Array.isArray(value)) {
    raw = value.filter((t): t is string => typeof t === 'string');
  } else if (typeof value === 'string') {
    raw = value.split(/[,\s]+/);
  } else if (value !== undefined && value !== null) {
    defaulted.push('tags');
  }

  return [...new Set(raw.map(normaliseTag).filter((t) => t !== ''))];
}

/** The first meaningful line of a note, without markdown markers, as a short statement. */
export function firstLine(body: string): string {
  for (const line of body.split('\n')) {
    const cleaned = line
      .replace(/^[\s#>*_-]+/, '')
      .replace(/[*_`]+/g, '')
      .trim();

    if (cleaned !== '') {
      return cleaned.slice(0, STATEMENT_MAX);
    }
  }

  return '';
}

export function sourceOf(
  value: unknown,
  recovered: boolean,
  ctx: ParseContext,
  isOutcome: boolean,
  defaulted: string[],
): { type: string; ref: string } {
  if (recovered && typeof value === 'string') {
    defaulted.push('source');

    return { type: 'imported', ref: value };
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    const type = text(v['type']);
    const ref = text(v['ref']);
    if (type !== null && ref !== null) {
      return { type: type.trim(), ref: ref.trim() };
    }
  }

  if (isOutcome && value === undefined) {
    return { type: 'system', ref: ctx.relPath };
  }

  defaulted.push('source');

  return { type: 'imported', ref: text(value)?.trim() ?? 'no source recorded' };
}

export function statusOf(
  value: unknown,
  kind: MemoryKind,
  defaulted: string[],
): MemoryStatus {
  const written = isOneOf(MemoryStatus.options, value) ? value : null;
  if (kind === 'rejected') {
    if (written === null || written === 'active' || written === 'rejected') {
      if (written === null && value !== undefined) {
        defaulted.push('status');
      }

      return 'rejected';
    }

    return written;
  }

  if (kind === 'outcome') {
    return written ?? 'active';
  }

  if (written === null || (kind === 'decision' && written === 'rejected')) {
    defaulted.push('status');

    return 'pending';
  }

  return written;
}

export function linksOf(
  data: Readonly<Record<string, unknown>>,
  body: string,
  id: string | null,
): MemoryLink[] {
  const links: MemoryLink[] = [];
  const seen = new Set<string>();
  const add = (rel: MemoryLink['rel'], target: string): void => {
    if (target !== id && !seen.has(`${rel}\0${target}`)) {
      seen.add(`${rel}\0${target}`);
      links.push({ rel, target_kind: 'record', target });
    }
  };

  for (const rel of ['supersedes', 'amends', 'reopens', 'cites'] as const) {
    extractRecordIds(data[rel]).forEach((t) => add(rel, t));
  }

  for (const rel of ['card', 'ticket'] as const) {
    const target = text(data[rel])?.trim();
    if (target !== undefined && !seen.has(`${rel}:${target}`)) {
      seen.add(`${rel}:${target}`);
      links.push({ rel, target_kind: rel, target });
    }
  }

  const linked = new Set(links.map((l) => l.target));
  extractRecordIds(body)
    .filter((t) => !linked.has(t))
    .forEach((t) => add('cites', t));

  return links;
}

/** The date a hand-written outcome belongs to: its `date`, else the `YYYY-MM-DD` its file name starts with. */
export function outcomeDate(
  data: Readonly<Record<string, unknown>>,
  relPath: string,
): string | null {
  const own = text(data['date']);
  if (own !== null) {
    return own.trim();
  }

  return /(?:^|\/)(\d{4}-\d{2}-\d{2})/.exec(relPath)?.[1] ?? null;
}
