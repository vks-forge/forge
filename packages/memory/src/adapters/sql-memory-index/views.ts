/**
 * Views of memory rows: lines, snippets, the record view and the caps that keep answers short.
 *
 * Why: what a Worker, the owner's screen and the CLI read are short pieces of plain text built from rows, and
 *   their size is a safety property, not polish: a Worker's tool schemas and answers sit in every session, so a
 *   record body is cut at 4,000 characters, a hit line at 160, and a whole answer at a fixed size. Snippets
 *   mark the matched words with index ranges into plain text, never markup, so the screen can draw them
 *   without ever rendering stored text as HTML.
 *
 * Exports: cut(), lineOf(), snippetFrom(), recordView(), fitJson(), BODY_CAP.
 * Depends on: @forge/core, types/sql-index. Pure, no IO.
 */

import type {
  MemoryHit,
  MemoryLink,
  MemoryLinkRow,
  MemoryRecordView,
  MemoryRow,
} from '@forge/core';

export const BODY_CAP = 4000;
const SNIPPET_CAP = 200;
const MARK_OPEN = '\u0001';
const MARK_CLOSE = '\u0002';

/** The text cut to `max` characters, with an ellipsis when it was cut. */
export function cut(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();

  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** The one line a hit or neighbour shows: the gist when the record has one, else the statement. */
export function lineOf(row: MemoryRow, max: number): string {
  return cut(row.gist ?? row.statement, max);
}

/** Turns the index's marked snippet into text and `[start, end]` ranges; stray control characters are dropped. */
export function snippetFrom(marked: string | null): MemoryHit['snippet'] {
  if (marked === null) {
    return undefined;
  }

  let text = '';
  let open: number | null = null;
  const marks: [number, number][] = [];
  for (const ch of marked) {
    if (ch === MARK_OPEN) {
      open = text.length;
    } else if (ch === MARK_CLOSE) {
      if (open !== null && text.length > open) {
        marks.push([open, text.length]);
      }

      open = null;
    } else if (text.length < SNIPPET_CAP) {
      text += ch;
    }
  }

  return text === ''
    ? undefined
    : { text, marks: marks.filter(([, end]) => end <= text.length) };
}

/** The longest prefix of `items` whose JSON is at most `max` characters, and whether any were left out. */
export function fitJson<T>(
  items: readonly T[],
  max: number,
): { fit: T[]; cutShort: boolean } {
  const fit: T[] = [];
  for (const item of items) {
    if (JSON.stringify([...fit, item]).length > max) {
      return { fit, cutShort: true };
    }

    fit.push(item);
  }

  return { fit, cutShort: false };
}

/** The record as the API and the tools return it; `full` lifts the body cap (the CLI's `--full`). */
export function recordView(
  row: MemoryRow,
  tags: readonly string[],
  links: readonly MemoryLinkRow[],
  full = false,
): MemoryRecordView {
  const truncated = !full && row.body.length > BODY_CAP;
  const out: MemoryLink[] = links.slice(0, 20).map((l) => ({
    rel: l.rel,
    target_kind: l.target_kind,
    target: l.target,
  }));

  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    statement: row.statement,
    body: truncated ? row.body.slice(0, BODY_CAP) : row.body,
    body_truncated: truncated,
    tags: [...tags],
    source: { type: row.source_type, ref: row.source_ref },
    author: row.author,
    origin: row.origin,
    confidence: row.confidence,
    pinned: row.pinned,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
    supersedes: links.find((l) => l.rel === 'supersedes')?.target ?? null,
    superseded_by: row.superseded_by,
    ...(row.approved_at === null ? {} : { approved_at: row.approved_at }),
    ...(row.approved_by === null ? {} : { approved_by: row.approved_by }),
    ...(row.rejected_at === null ? {} : { rejected_at: row.rejected_at }),
    ...(row.rejected_by === null ? {} : { rejected_by: row.rejected_by }),
    ...(row.rejected_reason === null ? {} : { rejected_reason: row.rejected_reason }),
    gist: row.gist,
    aliases: [...row.aliases],
    links: out,
    imported:
      row.imported_from === null
        ? null
        : { from: row.imported_from, defaulted_fields: row.lenient_fields ?? [] },
  };
}
