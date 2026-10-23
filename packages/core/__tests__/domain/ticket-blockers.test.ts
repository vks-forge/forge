/**
 * Pins the shared "what is this ticket still waiting for" rules.
 *
 * Why: the scheduler, the ticket page and the cancel dialog must agree. A done ticket must
 *   never read as "Waiting on" a ticket it already got past, a cancelled blocker never
 *   unblocks, and cancelling a ticket must name every open ticket that waits on it, directly
 *   or through another one.
 *
 * Pins: open blockers of an open ticket, none for any finished ticket (property), the dependents
 *   closure, and `can_cancel` for open and finished tickets and for a closed card.
 * Depends on: domain/ticket-blockers, schemas/ticket, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  canCancelTicket,
  openBlockerIds,
  openDependentIds,
} from '#/domain/ticket-blockers.js';
import { TERMINAL_STATUSES, TicketStatus } from '#/schemas/ticket.js';

const statusOf = (map: Record<string, string>) => (id: string) =>
  map[id] as TicketStatus | undefined;

describe('openBlockerIds', () => {
  it('lists the blockers that are not done, and keeps a cancelled one (it never unblocks)', () => {
    const out = openBlockerIds(
      { status: 'planned', blocked_by: ['FG-1', 'FG-2', 'FG-3', 'FG-4'] },
      statusOf({ 'FG-1': 'done', 'FG-2': 'in_progress', 'FG-3': 'cancelled' }),
    );

    expect(out).toEqual(['FG-2', 'FG-3', 'FG-4']);
  });

  it('is empty for a done ticket whose blockers are done', () => {
    expect(
      openBlockerIds(
        { status: 'done', blocked_by: ['FG-1'] },
        statusOf({ 'FG-1': 'done' }),
      ),
    ).toEqual([]);
  });

  it('is empty for every finished ticket, whatever its blockers (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TERMINAL_STATUSES),
        fc.array(fc.constantFrom(...TicketStatus.options), { maxLength: 5 }),
        (status, blockerStatuses) => {
          const ids = blockerStatuses.map((_, i) => `FG-${i + 1}`);
          const map = Object.fromEntries(ids.map((id, i) => [id, blockerStatuses[i]!]));

          return openBlockerIds({ status, blocked_by: ids }, statusOf(map)).length === 0;
        },
      ),
    );
  });
});

describe('openDependentIds', () => {
  it('finds dependents through other dependents, once each', () => {
    const open = [
      { id: 'FG-2', blocked_by: ['FG-1'] },
      { id: 'FG-3', blocked_by: ['FG-2', 'FG-1'] },
      { id: 'FG-4', blocked_by: [] },
    ];

    expect(openDependentIds(open, 'FG-1')).toEqual(['FG-2', 'FG-3']);
    expect(openDependentIds(open, 'FG-4')).toEqual([]);
  });
});

describe('canCancelTicket', () => {
  it('is true for an open ticket of an open card, false once finished or when the card is closed', () => {
    expect(canCancelTicket({ status: 'in_progress' }, { closed_reason: undefined })).toBe(
      true,
    );

    expect(canCancelTicket({ status: 'verifying' }, null)).toBe(true);
    expect(canCancelTicket({ status: 'done' }, { closed_reason: undefined })).toBe(false);
    expect(canCancelTicket({ status: 'cancelled' }, null)).toBe(false);
    expect(canCancelTicket({ status: 'in_progress' }, { closed_reason: 'x' })).toBe(
      false,
    );
  });
});
