/**
 * Pins: how a search snippet is cut at its marked ranges: every character lands in exactly one
 * part, overlapping and touching ranges merge, and a negative, reversed, empty, fractional or
 * out-of-range range is clamped or dropped instead of throwing or hiding text.
 *
 * Why: the ranges come from the wire and the text is whatever an agent or a web page once wrote.
 * A bad range must never crash the results list or swallow the words around it, and the cut must
 * be on plain text so the screen can draw it as text nodes, never as markup.
 * Depends on: domain/memory-snippet. Pure.
 */

import { describe, expect, it } from 'vitest';
import { snippetParts } from '#/domain/memory-snippet.js';

const joined = (parts: { text: string }[]) => parts.map((p) => p.text).join('');

describe('snippetParts', () => {
  it('cuts the text around each mark', () => {
    expect(
      snippetParts('use pnpm for tests', [
        [4, 8],
        [13, 18],
      ]),
    ).toEqual([
      { text: 'use ', marked: false },
      { text: 'pnpm', marked: true },
      { text: ' for ', marked: false },
      { text: 'tests', marked: true },
    ]);
  });

  it('returns the whole text unmarked when there are no marks', () => {
    expect(snippetParts('plain', [])).toEqual([{ text: 'plain', marked: false }]);
    expect(snippetParts('', [[0, 3]])).toEqual([]);
  });

  it('merges overlapping and touching ranges', () => {
    const parts = snippetParts('abcdefgh', [
      [4, 6],
      [1, 3],
      [3, 5],
    ]);

    expect(parts.filter((p) => p.marked).map((p) => p.text)).toEqual(['bcdef']);
  });

  it('clamps or drops ranges it cannot trust', () => {
    const text = '<b>x</b> hello';
    const parts = snippetParts(text, [
      [-5, 3],
      [10, 999],
      [7, 7],
      [9, 4],
      [Number.NaN, 5],
    ]);

    expect(joined(parts)).toBe(text);
    expect(parts.filter((p) => p.marked).map((p) => p.text)).toEqual(['<b>', 'ello']);
  });

  it('never loses a character for any ranges', () => {
    const text = 'a snippet with <script>alert(1)</script> inside';
    const cases: [number, number][][] = [
      [[0, 1]],
      [[5, 500]],
      [[3, 3]],
      [[-1, -1]],
      [
        [2, 9],
        [4, 12],
      ],
    ];

    for (const marks of cases) {
      expect(joined(snippetParts(text, marks))).toBe(text);
    }
  });
});
