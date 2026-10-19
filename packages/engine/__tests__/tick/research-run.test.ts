/**
 * Tests for how research results are fitted into the next model call.
 *
 * Why: the owner may allow up to 100 pages a run (d-0171), and every page excerpt is carried in the
 *   research step's input. Without a cap on the carried text a long run overflows the model's context
 *   and the step fails; with it the newest pages stay readable and older ones keep their ref only.
 *
 * Pins: everything is kept under the budget; over it the oldest page text goes first, rows without text
 *   are untouched, order is preserved and dropped pages are marked truncated.
 * Depends on: src/tick/research-run, vitest.
 */

import type { ResearchResult } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { fitResultsToPrompt } from '#/tick/research-run.js';

const page = (n: number, chars: number): ResearchResult => ({
  request: { op: 'fetch', url: `https://example.com/${n}` },
  ok: true,
  source: `S${n}`,
  text: 'x'.repeat(chars),
  truncated: false,
});

describe('fitResultsToPrompt', () => {
  it('keeps every page while they fit', () => {
    const results = [page(1, 100), page(2, 100)];

    expect(fitResultsToPrompt(results, 200)).toEqual(results);
  });

  it('drops the text of the oldest pages first and keeps their rows in order', () => {
    const miss: ResearchResult = {
      request: { op: 'search', query: 'a query' },
      ok: false,
      error: 'cap reached',
    };

    const fitted = fitResultsToPrompt(
      [page(1, 100), miss, page(2, 100), page(3, 100)],
      200,
    );

    expect(fitted.map((r) => r.source)).toEqual(['S1', undefined, 'S2', 'S3']);
    expect(fitted[0]?.text).toBeUndefined();
    expect(fitted[0]?.truncated).toBe(true);
    expect(fitted[1]).toBe(miss);
    expect(fitted[2]?.text).toHaveLength(100);
    expect(fitted[3]?.text).toHaveLength(100);
  });

  it('carries 100 full pages of the largest excerpt within the default budget', () => {
    const results = Array.from({ length: 100 }, (_, i) => page(i + 1, 12_000));
    const kept = fitResultsToPrompt(results).filter((r) => r.text !== undefined);

    expect(kept.length * 12_000).toBeLessThanOrEqual(400_000);
    expect(kept.at(-1)?.source).toBe('S100');
  });
});
