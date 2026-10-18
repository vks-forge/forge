/**
 * Pins when the same Director change becomes a proposal to change a project's lane.
 *
 * Why: a proposal asks the owner to edit their own pipeline, so it must never be noise. It needs the same
 *   change on enough tickets, from more than one card (one big card repeating an op is one decision, not a
 *   habit), in the recent window, on the same lane and the same base list (a changed list starts a new
 *   count), and never again once the owner decided on that key. Availability swaps never count. The rule is
 *   plain code over typed history so the Director cannot talk itself into a proposal.
 *
 * Pins: the threshold (3 tickets from 2 cards in the window, edge included), entries ignored on another base, lane
 *   or key, a suppressed key, tickets with no card, and the evidence picked one per card first.
 * Depends on: src/domain/proposal-trigger, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { pickEvidence, shouldPropose } from '#/domain/proposal-trigger.js';
import type { ProposalHistoryEntry } from '#/types/proposal-trigger.types.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-18T12:00:00.000Z');
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const KEY = 'standard:add:security-reviewer@after:g1';
const settings = { propose_after: 3, propose_min_cards: 2, propose_window_days: 30 };

const entry = (
  n: number,
  card: string | undefined,
  over: Partial<ProposalHistoryEntry> = {},
): ProposalHistoryEntry => ({
  ticket_id: `FOR-${n}`,
  ...(card === undefined ? {} : { card_id: card }),
  at: new Date(NOW - n * DAY).toISOString(),
  key: KEY,
  base_hash: HASH_A,
  lane: 'standard',
  reason: `Reason for ticket ${n} that is long enough.`,
  ...over,
});

const decide = (history: ProposalHistoryEntry[], over: Record<string, unknown> = {}) =>
  shouldPropose({
    key: KEY,
    lane: 'standard',
    base_hash: HASH_A,
    history,
    settings,
    suppressed: [],
    now: NOW,
    ...over,
  });

describe('shouldPropose', () => {
  it('proposes at the threshold: 3 tickets from 2 cards in the window', () => {
    const out = decide([entry(1, 'FOR-C1'), entry(2, 'FOR-C1'), entry(3, 'FOR-C2')]);

    expect(out.propose).toBe(true);
    expect(out.count).toBe(3);
    expect(out.cards).toBe(2);
  });

  it('does not propose with three tickets of one card', () => {
    expect(
      decide([entry(1, 'FOR-C1'), entry(2, 'FOR-C1'), entry(3, 'FOR-C1')]).propose,
    ).toBe(false);
  });

  it('does not propose below the ticket threshold', () => {
    expect(decide([entry(1, 'FOR-C1'), entry(2, 'FOR-C2')]).propose).toBe(false);
  });

  it('counts a ticket once however many times it was logged', () => {
    expect(
      decide([entry(1, 'FOR-C1'), entry(1, 'FOR-C1'), entry(2, 'FOR-C2')]).propose,
    ).toBe(false);
  });

  it('ignores entries outside the window, on another base, another lane or another key', () => {
    const base = [entry(1, 'FOR-C1'), entry(2, 'FOR-C2')];

    expect(decide([...base, entry(31, 'FOR-C3')]).propose).toBe(false);
    expect(decide([...base, entry(3, 'FOR-C3', { base_hash: HASH_B })]).propose).toBe(
      false,
    );

    expect(decide([...base, entry(3, 'FOR-C3', { lane: 'full' })]).propose).toBe(false);
    expect(
      decide([...base, entry(3, 'FOR-C3', { key: 'standard:remove:reviewer' })]).propose,
    ).toBe(false);
  });

  it('counts an entry exactly at the window edge', () => {
    const edge = entry(0, 'FOR-C3', { at: new Date(NOW - 30 * DAY).toISOString() });

    expect(decide([entry(1, 'FOR-C1'), entry(2, 'FOR-C2'), edge]).propose).toBe(true);
  });

  it('never proposes a suppressed key (any earlier proposal for that base)', () => {
    const history = [entry(1, 'FOR-C1'), entry(2, 'FOR-C2'), entry(3, 'FOR-C3')];

    expect(
      decide(history, { suppressed: [{ lane: 'standard', key: KEY, base_hash: HASH_A }] })
        .propose,
    ).toBe(false);

    expect(
      decide(history, { suppressed: [{ lane: 'standard', key: KEY, base_hash: HASH_B }] })
        .propose,
    ).toBe(true);
  });

  it('a ticket with no card never counts toward the card minimum', () => {
    expect(
      decide([entry(1, undefined), entry(2, undefined), entry(3, 'FOR-C1')]).propose,
    ).toBe(false);
  });

  it('never proposes below the thresholds, whatever the history (property)', () => {
    const hist = fc.array(
      fc.record({
        n: fc.integer({ min: 0, max: 40 }),
        card: fc.option(fc.constantFrom('FOR-C1', 'FOR-C2', 'FOR-C3'), {
          nil: undefined,
        }),
        hash: fc.constantFrom(HASH_A, HASH_B),
        key: fc.constantFrom(KEY, 'standard:remove:reviewer'),
      }),
      { maxLength: 12 },
    );

    fc.assert(
      fc.property(
        hist,
        fc.integer({ min: 2, max: 6 }),
        fc.integer({ min: 1, max: 3 }),
        (rows, after, minCards) => {
          const history = rows.map((r) =>
            entry(r.n, r.card, {
              ticket_id: `FOR-${r.n}`,
              base_hash: r.hash,
              key: r.key,
            }),
          );

          const out = decide(history, {
            settings: { ...settings, propose_after: after, propose_min_cards: minCards },
          });

          const inScope = history.filter(
            (h) =>
              h.key === KEY &&
              h.base_hash === HASH_A &&
              NOW - Date.parse(h.at) <= 30 * DAY,
          );

          if (out.propose) {
            expect(new Set(inScope.map((h) => h.ticket_id)).size).toBeGreaterThanOrEqual(
              after,
            );

            expect(
              new Set(inScope.flatMap((h) => h.card_id ?? [])).size,
            ).toBeGreaterThanOrEqual(minCards);

            expect(
              out.matching.every((h) => h.base_hash === HASH_A && h.key === KEY),
            ).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('pickEvidence', () => {
  it('quotes up to three reasons, one per card first, newest first', () => {
    const out = pickEvidence([
      entry(1, 'FOR-C1'),
      entry(2, 'FOR-C1'),
      entry(3, 'FOR-C2'),
      entry(4, 'FOR-C3'),
      entry(5, 'FOR-C3'),
    ]);

    expect(out.map((e) => e.ticket_id)).toEqual(['FOR-1', 'FOR-3', 'FOR-4']);
    expect(out[0]).toMatchObject({
      card_id: 'FOR-C1',
      reason: 'Reason for ticket 1 that is long enough.',
    });
  });

  it('fills from the same card when there are few cards', () => {
    const out = pickEvidence([entry(1, 'FOR-C1'), entry(2, 'FOR-C1')]);

    expect(out.map((e) => e.ticket_id)).toEqual(['FOR-1', 'FOR-2']);
  });
});
