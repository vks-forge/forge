/**
 * Tests for parking a ticket for a human without a Worker question.
 *
 * Why: lane limits and retry caps hold a ticket for a human even though no Worker ever
 *   asked anything. Faking a dispatch and a question would put false facts in the ticket's
 *   history, so `parked` is its own event, `unparked` is its release (to planned, because
 *   the ticket may never have run), and a blank reason is refused since the reason is the
 *   only thing the human sees.
 *
 * Pins: parked from planned / in_progress sets a trimmed blocked_reason; blank reason and
 *   other statuses are rejected; unparked returns to planned and clears the reason.
 * Depends on: src/domain/state-machine, helpers/fixtures, vitest.
 */

import { describe, expect, it } from 'vitest';
import { transition } from '#/domain/state-machine.js';
import type { Ticket } from '#/schemas/ticket.js';
import type { TicketEvent } from '#/types/ticket-events.types.js';
import { makeTicket } from '#tests/helpers/fixtures.js';

const T1 = '2026-10-13T01:00:00.000Z';

function apply(ticket: Ticket, ...events: TicketEvent[]): Ticket {
  let cur = ticket;
  for (const e of events) {
    const r = transition(cur, e);
    if (!r.ok) throw new Error(`unexpected ${JSON.stringify(r.error)}`);
    cur = r.value;
  }
  return cur;
}

describe('parked / unparked: an honest hold for a human', () => {
  it.each(['planned', 'in_progress'] as const)(
    'parks a %s ticket in waiting_human with a trimmed reason',
    (status) => {
      const t = apply(makeTicket({ status }), {
        type: 'parked',
        at: T1,
        reason: '  lane not enabled  ',
      });
      expect(t.status).toBe('waiting_human');
      expect(t.blocked_reason).toBe('lane not enabled');
    },
  );

  it.each(['', '   '])('rejects a blank reason %j', (reason) => {
    const r = transition(makeTicket({ status: 'planned' }), {
      type: 'parked',
      at: T1,
      reason,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('illegal_transition');
  });

  it.each(['inbox', 'blocked', 'verifying', 'review'] as const)(
    'rejects parking from %s',
    (status) => {
      const r = transition(makeTicket({ status }), {
        type: 'parked',
        at: T1,
        reason: 'x',
      });
      expect(r.ok).toBe(false);
    },
  );

  it('releases a parked ticket back to planned and clears the reason', () => {
    const parked = apply(makeTicket({ status: 'planned' }), {
      type: 'parked',
      at: T1,
      reason: 'x',
    });
    const u = apply(parked, { type: 'unparked', at: T1 });
    expect(u.status).toBe('planned');
    expect('blocked_reason' in u).toBe(true);
    expect(u.blocked_reason).toBeUndefined();
    expect(
      transition(makeTicket({ status: 'in_progress' }), { type: 'unparked', at: T1 }).ok,
    ).toBe(false);
  });
});
