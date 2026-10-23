/**
 * Tests for the needs-you items of a ticket.
 *
 * Why: the Ticket page's dock lists what waits on the owner for that ticket. Finished work
 *   waiting for a review or a name must show even when no escalation row exists, but a ticket the
 *   scheduler merely holds back (Cancel is all the owner can do) must not raise a "needs you"
 *   the owner cannot act on.
 *
 * Pins: a ticket's owner escalations become items; review and sign-off waits become their own
 *   items; a scheduler wait that only offers Cancel adds nothing.
 * Depends on: src/domain/needs-you, src/schemas/escalation, vitest.
 */

import { describe, expect, it } from 'vitest';
import { ticketNeedsYouItems } from '#/domain/needs-you.js';
import type { EscalationView } from '#/schemas/escalation.js';
import type { TicketId } from '#/schemas/ids.js';

const AT = '2026-10-19T10:00:00.000Z';
const tid = 'FG-7' as TicketId;

const question = {
  id: 'int-1',
  ticket_id: tid,
  ticket_title: 'Add login',
  kind: 'question',
  stage: 'owner',
  status: 'pending',
  actions: ['answer', 'cancel'],
  asked_at: AT,
  payload: {
    kind: 'question',
    text: 'Which provider?',
    source: 'ask_director',
    options: [],
  },
} as EscalationView;

describe('ticketNeedsYouItems', () => {
  it('lists the pending escalations of the ticket', () => {
    const items = ticketNeedsYouItems({
      ticket: { id: tid, status: 'waiting_human', updated_at: AT },
      escalations: [question],
      waitActions: ['answer', 'cancel'],
    });

    expect(items).toHaveLength(1);
  });

  it('adds a review item for finished work with no escalation of its own', () => {
    const items = ticketNeedsYouItems({
      ticket: { id: tid, status: 'review', updated_at: AT },
      escalations: [],
      waitActions: ['approve', 'rework', 'cancel'],
    });

    expect(items).toMatchObject([
      { kind: 'ticket_review', actions: ['approve', 'rework', 'cancel'], seq: null },
    ]);
  });

  it('adds a sign-off item for a ticket that needs a name', () => {
    const items = ticketNeedsYouItems({
      ticket: { id: tid, status: 'needs_signoff', updated_at: AT },
      escalations: [],
      waitActions: ['sign_off', 'rework', 'cancel'],
    });

    expect(items[0]?.kind).toBe('ticket_signoff');
  });

  it('adds nothing for a scheduler wait that only offers Cancel', () => {
    expect(
      ticketNeedsYouItems({
        ticket: { id: tid, status: 'planned', updated_at: AT },
        escalations: [],
        waitActions: ['cancel'],
      }),
    ).toEqual([]);
  });
});
