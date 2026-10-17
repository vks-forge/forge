/**
 * Property tests for the ticket state machine.
 *
 * Why: examples cannot enumerate every event order. A random walk over all events proves
 *   the invariants that make the machine safe to drive from several callers: no event
 *   leaves a terminal state, versions only increase, automatic rework never exceeds the
 *   cap, so a Director bug cannot loop a ticket or resurrect a merged one.
 *
 * Pins: version monotonic, no exit from terminal, rework cap holds over any event order
 *   (director-core.md §3-§4).
 * Depends on: src/domain/state-machine, src/schemas/ticket, helpers/fixtures,
 *   helpers/transition-events, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_AUTO_REWORKS, transition } from '#/domain/state-machine.js';
import type { TicketEvent } from '#/types/ticket-events.types.js';
import { TERMINAL_STATUSES } from '#/schemas/ticket.js';
import { makeTicket, T0 } from '#tests/helpers/fixtures.js';
import { T1, ev } from '#tests/helpers/transition-events.js';

const eventArb: fc.Arbitrary<TicketEvent> = fc.oneof(
  fc.constantFrom<TicketEvent>(
    ev.triaged,
    ev.dispatched,
    ev.verifying,
    ev.gate_failed,
    ev.passA,
    ev.passB,
    ev.passC,
    ev.merged,
    ev.cancelled,
  ),
  fc.constantFrom<TicketEvent>(
    { type: 'blocked', at: T1, reason: 'r' },
    { type: 'unblocked', at: T1 },
    { type: 'asked', at: T1 },
    { type: 'answered', at: T1 },
    { type: 'parked', at: T1, reason: 'p' },
    { type: 'unparked', at: T1 },
    { type: 'done', at: T1, signer: 's' },
    { type: 'rework', at: T1 },
    { type: 'regate', at: T1 },
  ),
);

describe('transition: properties', () => {
  it('status_version strictly increases on accept, is untouched on reject', () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 40 }), (events) => {
        let t = makeTicket();
        for (const e of events) {
          const r = transition(t, e);
          if (r.ok) {
            expect(r.value.status_version).toBe(t.status_version + 1);
            t = r.value;
          }
        }

        expect(t.created_at).toBe(T0);
      }),
    );
  });

  it('no path leaves a terminal state', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TERMINAL_STATUSES),
        fc.array(eventArb, { maxLength: 10 }),
        (status, events) => {
          const t = makeTicket({ status });
          for (const e of events) {
            expect(transition(t, e).ok).toBe(false);
          }
        },
      ),
    );
  });

  it('merged / done imply a gate_passed since the last verifying', () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 80 }), (events) => {
        let t = makeTicket();
        let passedThisCycle = false;
        for (const e of events) {
          const r = transition(t, e);
          if (!r.ok) {
            continue;
          }

          if (e.type === 'verifying') {
            passedThisCycle = false;
          }

          if (e.type === 'gate_passed') {
            passedThisCycle = true;
          }

          if (r.value.status === 'done' && (e.type === 'merged' || e.type === 'done')) {
            expect(passedThisCycle).toBe(true);
          }

          t = r.value;
        }
      }),
    );
  });

  it('automatic reworks never exceed the cap and lane never lowers', () => {
    const rank = { express: 0, standard: 1, full: 2 } as const;
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 80 }), (events) => {
        let t = makeTicket();
        for (const e of events) {
          const r = transition(t, e);
          if (!r.ok) {
            continue;
          }

          expect(r.value.rework_count).toBeLessThanOrEqual(MAX_AUTO_REWORKS);
          expect(rank[r.value.lane]).toBeGreaterThanOrEqual(rank[t.lane]);
          t = r.value;
        }
      }),
    );
  });

  it('parking from verifying never touches rework_count and a release resumes only there', () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 80 }), (events) => {
        let t = makeTicket();
        for (const e of events) {
          const r = transition(t, e);
          if (!r.ok) {
            continue;
          }

          if (e.type === 'parked' && t.status === 'verifying') {
            expect(r.value.rework_count).toBe(t.rework_count);
            expect(r.value.parked_from).toBe('verifying');
          }

          if (e.type === 'unparked') {
            expect(r.value.status).toBe(
              t.parked_from === 'verifying' ? 'verifying' : 'planned',
            );

            expect(r.value.parked_from).toBeUndefined();
          }

          if (r.value.status !== 'waiting_human') {
            expect(r.value.parked_from).toBeUndefined();
          }

          t = r.value;
        }
      }),
    );
  });
});
