/**
 * Pins rank fusion and the small boosts that decide which records a search shows first.
 *
 * Why: a search merges several ranked lists (all terms, any term, tags, links). A record that sits high in
 *   more than one list must beat one that sits high in a single list, and fusion must never invent an id
 *   that no list returned, or a Worker could be shown a record that scope filtering already removed.
 *   The boosts encode what the owner told us about memory: a pinned decision matters more, a pending
 *   proposal less, a superseded record much less, an old outcome fades, but a decision or a rejected
 *   approach never decays however old it is (d-0168).
 *
 * Pins: RRF scores and tie order, (property) no foreign ids and monotonic in extra lists, the boost
 *   factors, outcome half-life of 30 days and no decay for decisions and rejected approaches.
 * Depends on: src/domain/memory-search/fuse, src/domain/memory-search/rank, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { rrf } from '#/domain/memory-search/fuse.js';
import { boost } from '#/domain/memory-search/rank.js';

describe('rrf', () => {
  it('scores 1 / (60 + rank) per list and sorts best first', () => {
    const out = rrf([
      ['a', 'b'],
      ['b', 'c'],
    ]);

    expect(out.map((o) => o.id)).toEqual(['b', 'a', 'c']);
    expect(out[0]?.score).toBeCloseTo(1 / 62 + 1 / 61, 10);
  });

  it('keeps first-seen order on equal scores and handles no lists', () => {
    expect(rrf([['x'], ['y']]).map((o) => o.id)).toEqual(['x', 'y']);
    expect(rrf([])).toEqual([]);
  });

  it('never returns an id that is in no list (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(fc.stringMatching(/^[a-z]{1,3}$/), { maxLength: 10 })),
        (lists) => {
          const seen = new Set(lists.flat());

          return rrf(lists).every((o) => seen.has(o.id));
        },
      ),
    );
  });

  it('never ranks an id lower for appearing in one more list at the same position (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z]{1,2}$/), { minLength: 1, maxLength: 8 }),
        (base) => {
          const ids = [...new Set(base)];
          const before = rrf([ids]);
          const after = rrf([ids, ids]);

          return before.every((o, i) => after[i]?.id === o.id);
        },
      ),
    );
  });
});

describe('boost', () => {
  const base = {
    pinned: false,
    status: 'active',
    kind: 'decision',
    ageDays: 400,
  } as const;

  it('multiplies pinned by 1.15, pending by 0.9 and superseded by 0.6', () => {
    expect(boost(1, base)).toBe(1);
    expect(boost(1, { ...base, pinned: true })).toBeCloseTo(1.15, 10);
    expect(boost(1, { ...base, status: 'pending', kind: 'proposal' })).toBeCloseTo(
      0.9,
      10,
    );

    expect(boost(1, { ...base, status: 'superseded' })).toBeCloseTo(0.6, 10);
  });

  it('halves an outcome every 30 days and never decays a decision or a rejected approach', () => {
    const outcome = { ...base, kind: 'outcome', ageDays: 30 } as const;

    expect(boost(1, outcome)).toBeCloseTo(0.5, 10);
    expect(boost(1, { ...outcome, ageDays: 60 })).toBeCloseTo(0.25, 10);
    expect(
      boost(1, { ...base, kind: 'rejected', status: 'rejected', ageDays: 5000 }),
    ).toBe(1);
  });
});
