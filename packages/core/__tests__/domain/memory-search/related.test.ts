/**
 * Pins how related records are weighed: rare shared tags count, common ones do not.
 *
 * Why: "related" must point at the records worth reading next. A tag that nearly every decision carries
 *   says nothing about two records being close, while a tag only three records share says a lot. Weighing
 *   tags by how rare they are (and ignoring those on more than a quarter of the active records) and
 *   picking a record's most distinctive words keeps the neighbours useful instead of noisy.
 *
 * Pins: tag weight falls with document frequency, tags over 25% of records get no weight, and the eight
 *   most distinctive terms prefer rare words over frequent ones.
 * Depends on: src/domain/memory-search/related, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  distinctiveTerms,
  tagWeights,
  termFrequencies,
} from '#/domain/memory-search/related.js';

describe('tagWeights', () => {
  it('weighs a rare tag above a common one', () => {
    const w = tagWeights({ rare: 2, common: 20 }, 100);

    expect(w.get('rare')).toBeGreaterThan(w.get('common') ?? 0);
    expect(w.get('rare')).toBeCloseTo(Math.log(100 / 2), 10);
  });

  it('ignores tags held by more than 25% of the records', () => {
    const w = tagWeights({ everywhere: 60, edge: 25, rare: 3 }, 100);

    expect(w.has('everywhere')).toBe(false);
    expect(w.has('edge')).toBe(true);
    expect(w.has('rare')).toBe(true);
  });

  it('is empty without records', () => {
    expect(tagWeights({ a: 1 }, 0).size).toBe(0);
  });
});

describe('distinctiveTerms', () => {
  it('counts words once per occurrence, without filler', () => {
    const tf = termFrequencies('Vector memory and the memory index of memory');

    expect(tf.get('memory')).toBe(3);
    expect(tf.has('the')).toBe(false);
  });

  it('prefers a rare word to a frequent one and returns at most eight', () => {
    const tf = termFrequencies(
      'alpha beta gamma delta epsilon zeta eta theta iota kappa',
    );

    const df: Record<string, number> = { alpha: 90, beta: 1 };
    const out = distinctiveTerms(tf, df, 100);

    expect(out).toHaveLength(8);
    expect(out[0]).not.toBe('alpha');
    expect(out.indexOf('beta')).toBeLessThan(
      out.indexOf('alpha') === -1 ? 99 : out.indexOf('alpha'),
    );
  });
});
