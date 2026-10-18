/**
 * Plain-text output of the `forge memory` commands.
 *
 * Why: the output is read by a person in a terminal and by a model in a session, so it is short and regular:
 *   one line per hit (`d-0012 decision/active  statement cut at 140  [why]`), and a record printed with its
 *   provenance first (who wrote it, from where, whether it was imported with fields filled in) and its body last,
 *   cut at 4,000 characters unless the caller asks for it whole. Stored text is printed as text and nothing else.
 *
 * Exports: hitLine(), relatedLine(), recordText(), cut().
 * Depends on: @forge/core (types only). Pure, no IO.
 */

import type { MemoryHit, MemoryRecordView, MemoryRelated } from '@forge/core';

const LINE = 140;

/** The text on one line, cut with an ellipsis. */
export function cut(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();

  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** `d-0012 decision/active  statement  [why]`, noting a decision this hit replaced. */
export function hitLine(hit: MemoryHit): string {
  const replaced = hit.replaced_by === undefined ? '' : ` (replaces ${hit.replaced_by})`;

  return `${hit.id} ${hit.kind}/${hit.status}  ${cut(hit.line, LINE)}${replaced}  [${hit.why}]`;
}

/** `d-0012 decision/active  statement  (reason, reason)`. */
export function relatedLine(r: MemoryRelated): string {
  return `${r.id} ${r.kind}/${r.status}  ${cut(r.line, LINE)}  (${r.reasons.join(', ')})`;
}

/** A record with its provenance, links and body. */
export function recordText(v: MemoryRecordView): string {
  const lines = [
    `${v.id}  ${v.kind}/${v.status}${v.pinned ? '  pinned' : ''}`,
    v.statement,
    '',
    `source: ${v.source.type} - ${v.source.ref}`,
    `author: ${v.author} - origin: ${v.origin} - valid from ${v.valid_from}${v.valid_to === null ? '' : ` to ${v.valid_to}`}`,
  ];

  if (v.tags.length > 0) {
    lines.push(`tags: ${v.tags.join(', ')}`);
  }

  if (v.supersedes !== null || v.superseded_by !== null) {
    lines.push(
      [
        v.supersedes === null ? '' : `supersedes ${v.supersedes}`,
        v.superseded_by === null ? '' : `superseded by ${v.superseded_by}`,
      ]
        .filter((p) => p !== '')
        .join(' - '),
    );
  }

  const links = v.links.filter((l) => l.rel !== 'supersedes');
  if (links.length > 0) {
    lines.push(`links: ${links.map((l) => `${l.rel} ${l.target}`).join(', ')}`);
  }

  if (v.imported !== null) {
    lines.push(
      `imported from ${v.imported.from}${
        v.imported.defaulted_fields.length > 0
          ? `; filled in: ${v.imported.defaulted_fields.join(', ')}`
          : ''
      }`,
    );
  }

  if (v.possible_conflicts !== undefined && v.possible_conflicts.length > 0) {
    lines.push(`may conflict with: ${v.possible_conflicts.map((c) => c.id).join(', ')}`);
  }

  if (v.body !== '') {
    lines.push('', v.body);
    if (v.body_truncated) {
      lines.push('', '(body cut at 4,000 characters; use --full to print it whole)');
    }
  }

  return `${lines.join('\n')}\n`;
}
