/**
 * Tests for the card phase machine.
 *
 * Why: the card phase decides whether the Director may still ask questions, whether a plan
 *   awaits the owner and whether tickets may exist (d-0134). If `transitionCard()` allowed
 *   a card to skip the plan, leave `closed` or ignore a stale writer, the Board would show
 *   work that was never planned or two writers would overwrite each other.
 *
 * Pins: each legal move, refusal of every other (phase, event) pair, CAS on phase_version,
 *   the needs_you flag (set, cleared, cleared by approve, complete and close, refused on
 *   closed and done), the version bump, and properties over random event walks: closed is a
 *   dead end, versions strictly increase, approved is never reached without plan_ready.
 * Depends on: src/domain/card-phase, src/schemas/card, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CARD_MOVES, transitionCard } from '#/domain/card-phase.js';
import { CARD_PHASES } from '#/schemas/card.js';
import type { Card } from '#/schemas/card.js';
import type { CardPhaseEvent } from '#/types/card-phase.types.js';

type State = Pick<Card, 'phase' | 'phase_version' | 'needs_you'>;

const at = (phase: Card['phase'], over: Partial<State> = {}): State => ({
  phase,
  phase_version: 3,
  needs_you: false,
  ...over,
});

const MOVE_TYPES = Object.keys(CARD_MOVES) as (keyof typeof CARD_MOVES)[];
const EVENT_TYPES: CardPhaseEvent['type'][] = [
  ...MOVE_TYPES,
  'needs_you_set',
  'needs_you_cleared',
];

describe('transitionCard: moves', () => {
  it.each([
    ['grilling', 'start_verifying', 'verifying'],
    ['verifying', 'plan_written', 'plan_ready'],
    ['grilling', 'plan_written', 'plan_ready'],
    ['plan_ready', 'approve', 'approved'],
    ['approved', 'queue', 'queued'],
    ['queued', 'start', 'in_progress'],
    ['approved', 'start', 'in_progress'],
    ['in_progress', 'complete', 'done'],
    ['done', 'resume_work', 'in_progress'],
    ['plan_ready', 'regrill', 'grilling'],
    ['in_progress', 'regrill', 'grilling'],
    ['done', 'regrill', 'grilling'],
    ['grilling', 'close', 'closed'],
    ['done', 'close', 'closed'],
  ] as const)('moves %s with %s to %s and bumps the version', (from, type, to) => {
    const r = transitionCard(at(from), { type });

    expect(r).toEqual({
      ok: true,
      value: { phase: to, phase_version: 4, needs_you: false },
    });
  });

  it('refuses every move the table does not list, naming the phase and event', () => {
    for (const phase of CARD_PHASES) {
      for (const type of MOVE_TYPES) {
        if (CARD_MOVES[type].from.includes(phase)) {
          continue;
        }

        expect(transitionCard(at(phase), { type })).toEqual({
          ok: false,
          error: { kind: 'illegal_transition', phase, event: type },
        });
      }
    }
  });

  it('never reaches approved without a plan: grilling and verifying cannot approve', () => {
    for (const phase of ['grilling', 'verifying'] as const) {
      expect(transitionCard(at(phase), { type: 'approve' }).ok).toBe(false);
    }
  });

  it('keeps closed a dead end for every event', () => {
    for (const type of EVENT_TYPES) {
      expect(transitionCard(at('closed'), { type }).ok).toBe(false);
    }
  });
});

describe('transitionCard: compare and swap', () => {
  it('accepts the version the caller read and refuses a stale one', () => {
    expect(
      transitionCard(at('grilling'), { type: 'plan_written', expected_version: 3 }).ok,
    ).toBe(true);

    expect(
      transitionCard(at('grilling'), { type: 'plan_written', expected_version: 2 }),
    ).toEqual({ ok: false, error: { kind: 'stale_version', expected: 2, actual: 3 } });
  });

  it('checks the version before the move, so a stale writer learns it lost', () => {
    const r = transitionCard(at('closed'), { type: 'approve', expected_version: 1 });

    expect(r).toMatchObject({ ok: false, error: { kind: 'stale_version' } });
  });
});

describe('transitionCard: needs_you', () => {
  it('sets and clears the flag without moving the phase', () => {
    const set = transitionCard(at('grilling'), { type: 'needs_you_set' });
    const cleared = transitionCard(at('grilling', { needs_you: true }), {
      type: 'needs_you_cleared',
    });

    expect(set).toEqual({
      ok: true,
      value: { phase: 'grilling', phase_version: 4, needs_you: true },
    });

    expect(cleared).toEqual({
      ok: true,
      value: { phase: 'grilling', phase_version: 4, needs_you: false },
    });
  });

  it('keeps the flag through a phase move that does not end the wait', () => {
    const r = transitionCard(at('verifying', { needs_you: true }), {
      type: 'plan_written',
    });

    expect(r).toMatchObject({
      ok: true,
      value: { phase: 'plan_ready', needs_you: true },
    });
  });

  it.each([
    ['plan_ready', 'approve'],
    ['in_progress', 'complete'],
    ['grilling', 'close'],
  ] as const)('clears the flag when %s is moved by %s', (phase, type) => {
    const r = transitionCard(at(phase, { needs_you: true }), { type });

    expect(r).toMatchObject({ ok: true, value: { needs_you: false } });
  });

  it('refuses to flag a done or closed card', () => {
    for (const phase of ['done', 'closed'] as const) {
      expect(transitionCard(at(phase), { type: 'needs_you_set' }).ok).toBe(false);
    }
  });
});

describe('transitionCard: properties', () => {
  const eventArb = fc
    .constantFrom(...EVENT_TYPES)
    .map((type) => ({ type }) as CardPhaseEvent);

  it('bumps the version by one on accept; walks never leave closed or skip plan_ready', () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 40 }), (events) => {
        let card = at('grilling', { phase_version: 0 });
        let sawPlan = false;
        for (const e of events) {
          const r = transitionCard(card, e);
          if (!r.ok) {
            continue;
          }

          expect(r.value.phase_version).toBe(card.phase_version + 1);
          expect(card.phase).not.toBe('closed');
          sawPlan ||= r.value.phase === 'plan_ready';
          if (r.value.phase === 'approved') {
            expect(sawPlan).toBe(true);
          }

          card = r.value;
        }
      }),
    );
  });

  it('is pure: the same input gives the same answer and the input is not changed', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CARD_PHASES), eventArb, (phase, e) => {
        const card = at(phase);
        const before = { ...card };

        expect(transitionCard(card, e)).toEqual(transitionCard(card, e));
        expect(card).toEqual(before);
      }),
    );
  });
});
