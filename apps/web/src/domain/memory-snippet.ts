/**
 * Search snippets as plain pieces with marked ranges.
 *
 * Why: a search result shows the words that matched, highlighted, but the text is whatever a
 *   Director or Worker once wrote (or a hostile web page it quoted), so it must never be turned
 *   into HTML. The server sends the snippet as plain text plus `[start, end)` index ranges; this
 *   cuts the text into pieces the screen draws as text nodes and `<mark>` elements. Ranges from
 *   the wire are not trusted: a negative, reversed, out-of-range or overlapping range is
 *   clamped or dropped, so a bad range can never throw or hide text.
 *
 * Exports: snippetParts().
 * Depends on: types/memory-snippet.types. Pure.
 */

import type { SnippetPart } from '#/types/memory-snippet.types.js';

/** The text cut at the marks, in order; every character appears in exactly one part. */
export function snippetParts(
  text: string,
  marks: readonly (readonly [number, number])[],
): SnippetPart[] {
  const ranges = marks
    .map(([start, end]): [number, number] => [
      Math.max(0, Math.min(text.length, Math.floor(start))),
      Math.max(0, Math.min(text.length, Math.floor(end))),
    ])
    .filter(
      ([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start,
    )
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push([...range]);
    }
  }

  const parts: SnippetPart[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) {
      parts.push({ text: text.slice(cursor, start), marked: false });
    }

    parts.push({ text: text.slice(start, end), marked: true });
    cursor = end;
  }

  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), marked: false });
  }

  return parts;
}
