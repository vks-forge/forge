/**
 * Tests for the `conflict_found` ticket event.
 *
 * Why: when main moves under a ticket, Forge merges it in and the ticket's writer resolves any
 *   clash. That road must be bounded (a writer that cannot combine the changes must reach a
 *   human, not loop) and must not eat the gate-failure rework budget, or one clash would
 *   leave a ticket one gate failure from parking.
 *
 * Pins: verifying -> in_progress with conflict_count + 1 and rework_count untouched, the cap
 *   (MAX_CONFLICT_RESOLVES) parking in waiting_human with a `merge conflict:` reason and no
 *   `parked_from`, a release from that park going to planned (not the no-op verify), illegal
 *   from every other status, and a property: no event order pushes conflict_count over the cap.
 * Depends on: src/domain/state-machine, helpers/fixtures, helpers/transition-events,
 *   fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_CONFLICT_RESOLVES, transition } from '#/domain/state-machine.js';
import { TicketStatus, type Ticket } from '#/schemas/ticket.js';
import type { TicketEvent } from '#/types/ticket-events.types.js';
import { makeTicket } from '#tests/helpers/fixtures.js';
import { T1, apply, ev } from '#tests/helpers/transition-events.js';

const found: TicketEvent = { type: 'conflict_found', at: T1, files: ['a.txt'] };

describe('transition: conflict_found', () => {
  it('sends a verifying ticket back to in_progress, counting the conflict not a rework', () => {
    const t = apply(makeTicket({ status: 'verifying', rework_count: 1 }), found);

    expect(t).toMatchObject({
      status: 'in_progress',
      conflict_count: 1,
      rework_count: 1,
    });
  });

  it('parks at the cap in waiting_human with a conflict reason and no parked_from', () => {
    const t = apply(
      makeTicket({ status: 'verifying', conflict_count: MAX_CONFLICT_RESOLVES }),
      found,
    );

    expect(t.status).toBe('waiting_human');
    expect(t.blocked_reason?.startsWith('merge conflict:')).toBe(true);
    expect(t.parked_from).toBeUndefined();
    expect(t.conflict_count).toBe(MAX_CONFLICT_RESOLVES);
  });

  it('releases a capped park to planned so dispatch starts a Worker', () => {
    const parked = apply(
      makeTicket({ status: 'verifying', conflict_count: MAX_CONFLICT_RESOLVES }),
      found,
    );

    expect(apply(parked, { type: 'unparked', at: T1 }).status).toBe('planned');
  });

  it('is illegal from every status but verifying', () => {
    for (const status of TicketStatus.options.filter((s) => s !== 'verifying')) {
      expect(transition(makeTicket({ status }), found).ok).toBe(false);
    }
  });

  it('never lets conflict_count pass the cap, whatever the event order', () => {
    const arb = fc.constantFrom<TicketEvent>(
      ev.dispatched,
      ev.verifying,
      ev.gate_failed,
      ev.passA,
      found,
      { type: 'unparked', at: T1 },
      { type: 'rework', at: T1 },
      { type: 'regate', at: T1 },
    );

    fc.assert(
      fc.property(fc.array(arb, { maxLength: 80 }), (events) => {
        let t: Ticket = makeTicket({ status: 'planned' });
        for (const e of events) {
          const r = transition(t, e);
          if (r.ok) {
            expect(r.value.conflict_count).toBeLessThanOrEqual(MAX_CONFLICT_RESOLVES);
            t = r.value;
          }
        }
      }),
    );
  });
});
