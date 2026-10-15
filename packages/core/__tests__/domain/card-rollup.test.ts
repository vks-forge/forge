/**
 * Tests for the card column rollup.
 *
 * Why: the Board column is never stored (d-0107), so this one function is the only thing
 *   that decides whether a card says "Needs you", "In progress" or "Done". A wrong
 *   precedence hides a question the owner must answer, or marks unmerged work Done, and
 *   nothing else would catch it because no stored column exists to disagree.
 *
 * Pins: each column's rule, the d-0107 precedence (Needs you, then Closed, then In progress,
 *   then Done), closed
 *   as the one explicit state, discussion cards staying in Shaping, questions of other
 *   cards being ignored, and properties over any set of ticket statuses.
 * Depends on: src/domain/card-rollup, src/schemas/ticket, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { rollupCardColumn } from '#/domain/card-rollup.js';
import { TicketStatus } from '#/schemas/ticket.js';
import type { Ticket } from '#/schemas/ticket.js';

const open = {};
const t = (n: number, status: Ticket['status']) => ({
  id: `SF-${n}` as Ticket['id'],
  status,
});

const asked = (ticketId: string, status = 'pending' as const) => ({
  ticket_id: ticketId,
  status,
});

describe('rollupCardColumn', () => {
  it('puts a card with no tickets in shaping (a discussion, or a plan not yet approved)', () => {
    expect(rollupCardColumn(open, [], [])).toBe('shaping');
  });

  it('puts a card whose tickets are all untriaged in new', () => {
    expect(rollupCardColumn(open, [t(1, 'inbox')], [])).toBe('new');
    expect(rollupCardColumn(open, [t(1, 'inbox'), t(2, 'cancelled')], [])).toBe('new');
  });

  it.each(['planned', 'in_progress', 'verifying', 'blocked'] as const)(
    'puts a card with a %s ticket in in_progress',
    (status) => {
      expect(rollupCardColumn(open, [t(1, status)], [])).toBe('in_progress');
    },
  );

  it.each(['waiting_human', 'review', 'needs_signoff'] as const)(
    'puts a card with a %s ticket in needs_you',
    (status) => {
      expect(rollupCardColumn(open, [t(1, status)], [])).toBe('needs_you');
    },
  );

  it('puts a card in needs_you for a pending question even when the ticket looks busy', () => {
    expect(rollupCardColumn(open, [t(1, 'in_progress')], [asked('SF-1')])).toBe(
      'needs_you',
    );
  });

  it('lets needs_you win over in_progress and done', () => {
    expect(
      rollupCardColumn(open, [t(1, 'in_progress'), t(2, 'review'), t(3, 'done')], []),
    ).toBe('needs_you');
  });

  it('lets in_progress win over done while any ticket is still running', () => {
    expect(rollupCardColumn(open, [t(1, 'done'), t(2, 'verifying')], [])).toBe(
      'in_progress',
    );
  });

  it('puts a card in done when every ticket that was not cancelled is merged', () => {
    expect(rollupCardColumn(open, [t(1, 'done'), t(2, 'done')], [])).toBe('done');
    expect(rollupCardColumn(open, [t(1, 'done'), t(2, 'cancelled')], [])).toBe('done');
  });

  it('puts a card whose tickets were all cancelled back in shaping', () => {
    expect(rollupCardColumn(open, [t(1, 'cancelled')], [])).toBe('shaping');
  });

  it('ignores questions that are answered or belong to another card', () => {
    const tickets = [t(1, 'done')];

    expect(rollupCardColumn(open, tickets, [asked('SF-1', 'answered' as never)])).toBe(
      'done',
    );

    expect(rollupCardColumn(open, tickets, [asked('SF-99')])).toBe('done');
  });

  it('puts a closed card in closed over its running or finished tickets', () => {
    const closed = { closed_reason: 'duplicate of SF-C3' };

    expect(rollupCardColumn(closed, [t(1, 'in_progress'), t(2, 'done')], [])).toBe(
      'closed',
    );

    expect(rollupCardColumn(closed, [], [])).toBe('closed');
  });

  it('keeps a closed card in needs_you while a question or review is waiting (d-0107)', () => {
    const closed = { closed_reason: 'duplicate of SF-C3' };

    expect(rollupCardColumn(closed, [t(1, 'in_progress')], [asked('SF-1')])).toBe(
      'needs_you',
    );

    expect(rollupCardColumn(closed, [t(1, 'review')], [])).toBe('needs_you');
  });
});

describe('rollupCardColumn: properties', () => {
  const statuses = fc.array(fc.constantFrom(...TicketStatus.options), { maxLength: 8 });
  const ticketsOf = (list: Ticket['status'][]) => list.map((s, i) => t(i + 1, s));

  it('is needs_you whenever one ticket waits on a person and the card is open', () => {
    fc.assert(
      fc.property(
        statuses,
        fc.constantFrom('waiting_human', 'review', 'needs_signoff'),
        (list, w) => {
          const tickets = ticketsOf([...list, w]);

          expect(rollupCardColumn(open, tickets, [])).toBe('needs_you');
        },
      ),
    );
  });

  it('is never done while a ticket is unmerged and not cancelled', () => {
    fc.assert(
      fc.property(statuses, (list) => {
        const tickets = ticketsOf(list);
        const unfinished = list.some((s) => s !== 'done' && s !== 'cancelled');

        if (unfinished) {
          expect(rollupCardColumn(open, tickets, [])).not.toBe('done');
        }
      }),
    );
  });

  it('is closed exactly when a reason is set and nothing waits on a person', () => {
    const waits = (list: Ticket['status'][]) =>
      list.some((s) => ['waiting_human', 'review', 'needs_signoff'].includes(s));

    fc.assert(
      fc.property(statuses, fc.boolean(), (list, isClosed) => {
        const card = isClosed ? { closed_reason: 'r' } : open;
        const column = rollupCardColumn(card, ticketsOf(list), []);

        expect(column === 'closed').toBe(isClosed && !waits(list));
      }),
    );
  });

  it('puts a card in needs_you for any pending question, closed or not', () => {
    fc.assert(
      fc.property(statuses, fc.boolean(), (list, isClosed) => {
        const card = isClosed ? { closed_reason: 'r' } : open;
        const tickets = ticketsOf([...list, 'in_progress']);
        const last = tickets[tickets.length - 1]!;

        expect(rollupCardColumn(card, tickets, [asked(last.id)])).toBe('needs_you');
      }),
    );
  });

  it('does not depend on the order of the tickets', () => {
    fc.assert(
      fc.property(statuses, (list) => {
        const forward = rollupCardColumn(open, ticketsOf(list), []);
        const backward = rollupCardColumn(open, ticketsOf([...list].reverse()), []);

        expect(backward).toBe(forward);
      }),
    );
  });

  it('is deterministic: the same facts always give the same column', () => {
    fc.assert(
      fc.property(statuses, fc.boolean(), (list, withQuestion) => {
        const questions = withQuestion ? [asked('SF-1')] : [];

        expect(rollupCardColumn(open, ticketsOf(list), questions)).toBe(
          rollupCardColumn(open, ticketsOf(list), questions),
        );
      }),
    );
  });
});
