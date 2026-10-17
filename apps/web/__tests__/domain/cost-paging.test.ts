/**
 * Pins: the paging words and edges of the Cost tables.
 *
 * Why: "11–20 of 134", a disabled Next on the last page and a page-size change that keeps the
 *   first visible row on screen are the whole paging contract the owner sees; an off-by-one
 *   here shows a wrong range or strands the owner past the end of the ranking.
 * Depends on: src/domain/cost-paging.
 */

import { describe, expect, it } from 'vitest';
import { nextOffset, pageLabel, prevOffset, resizeOffset } from '#/domain/cost-paging.js';

describe('pageLabel', () => {
  it('names the visible rows of the total', () => {
    expect(pageLabel(10, 10, 134)).toBe('11–20 of 134');
  });

  it('handles a short last page and an empty table', () => {
    expect(pageLabel(130, 4, 134)).toBe('131–134 of 134');
    expect(pageLabel(0, 0, 0)).toBe('0 of 0');
  });
});

describe('prevOffset and nextOffset', () => {
  it('stop at both ends', () => {
    expect(prevOffset(0, 10)).toBeNull();
    expect(nextOffset(130, 10, 134)).toBeNull();
    expect(nextOffset(120, 10, 130)).toBeNull();
  });

  it('step by one page and never below zero', () => {
    expect(prevOffset(5, 10)).toBe(0);
    expect(prevOffset(30, 10)).toBe(20);
    expect(nextOffset(0, 10, 134)).toBe(10);
  });
});

describe('resizeOffset', () => {
  it('snaps to the page boundary of the new size', () => {
    expect(resizeOffset(30, 25)).toBe(25);
    expect(resizeOffset(20, 50)).toBe(0);
    expect(resizeOffset(50, 10)).toBe(50);
  });
});
