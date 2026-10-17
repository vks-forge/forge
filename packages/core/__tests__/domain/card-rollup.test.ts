/**
 * Tests for the card column rollup.
 *
 * Why: the Board column is never stored (d-0107, d-0139): it follows from the stored phase
 *   and from whether anyone waits on the owner, so this one function is the only thing that
 *   decides whether a card says "Shaping", "Needs you" or "Done". A wrong precedence hides a
 *   question the owner must answer, or shows unplanned work as running, and nothing else
 *   would catch it because no stored column exists to disagree.
 *
 * Pins: the phase to column table, needs_you winning over every phase but closed, the three
 *   ways a card needs the owner (own flag, ticket waiting, pending question), closed winning
 *   over needs_you, questions of other cards being ignored, and properties over any phase.
 * Depends on: src/domain/card-rollup, src/schemas/card, src/schemas/ticket, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cardNeedsYou, rollupCardColumn } from '#/domain/card-rollup.js';
import { CARD_PHASES } from '#/schemas/card.js';
import type { Card } from '#/schemas/card.js';
import { TicketStatus } from '#/schemas/ticket.js';
import type { Ticket } from '#/schemas/ticket.js';

const card = (
  phase: Card['phase'],
  over: Partial<Pick<Card, 'needs_you' | 'closed_reason'>> = {},
) => ({ phase, needs_you: false, ...over });

const t = (n: number, status: Ticket['status']) => ({
  id: `SF-${n}` as Ticket['id'],
  status,
});

const OWNER_SINCE = '2026-10-17T00:00:00.000Z';

const asked = (ticketId: string, status = 'pending' as const) => ({
  ticket_id: ticketId,
  status,
  escalated_at: OWNER_SINCE,
});

/** A question the Director is still looking at: not yet the owner's. */
const withDirector = (ticketId: string) => ({
  ticket_id: ticketId,
  status: 'pending' as const,
});

describe('rollupCardColumn', () => {
  it.each([
    ['grilling', 'shaping'],
    ['verifying', 'shaping'],
    ['plan_ready', 'shaping'],
    ['approved', 'queued'],
    ['queued', 'queued'],
    ['in_progress', 'in_progress'],
    ['done', 'done'],
    ['closed', 'closed'],
  ] as const)('puts a %s card in %s', (phase, column) => {
    expect(rollupCardColumn(card(phase), [], [])).toBe(column);
  });

  it.each(CARD_PHASES.filter((p) => p !== 'closed'))(
    'puts a %s card that waits on the owner in needs_you',
    (phase) => {
      expect(rollupCardColumn(card(phase, { needs_you: true }), [], [])).toBe(
        'needs_you',
      );
    },
  );

  it.each(['waiting_human', 'blocked', 'review', 'needs_signoff'] as const)(
    'puts an in_progress card with a %s ticket in needs_you',
    (status) => {
      expect(rollupCardColumn(card('in_progress'), [t(1, status)], [])).toBe('needs_you');
    },
  );

  it('puts a card in needs_you for a pending question even when the ticket looks busy', () => {
    expect(
      rollupCardColumn(card('in_progress'), [t(1, 'in_progress')], [asked('SF-1')]),
    ).toBe('needs_you');
  });

  it('does not count a question the Director is still looking at', () => {
    expect(
      rollupCardColumn(
        card('in_progress'),
        [t(1, 'in_progress')],
        [withDirector('SF-1')],
      ),
    ).toBe('in_progress');

    expect(
      rollupCardColumn(
        card('in_progress'),
        [t(1, 'waiting_human')],
        [withDirector('SF-1')],
      ),
    ).toBe('in_progress');
  });

  it('counts a waiting ticket once one of its questions is with the owner', () => {
    expect(
      rollupCardColumn(
        card('in_progress'),
        [t(1, 'waiting_human')],
        [withDirector('SF-1'), asked('SF-1')],
      ),
    ).toBe('needs_you');
  });

  it('ignores questions that are answered or belong to another card', () => {
    const tickets = [t(1, 'done')];

    expect(
      rollupCardColumn(card('done'), tickets, [asked('SF-1', 'answered' as never)]),
    ).toBe('done');

    expect(rollupCardColumn(card('done'), tickets, [asked('SF-99')])).toBe('done');
  });

  it('does not let running tickets move a card out of its stored phase', () => {
    expect(rollupCardColumn(card('grilling'), [t(1, 'in_progress')], [])).toBe('shaping');
    expect(rollupCardColumn(card('queued'), [t(1, 'done')], [])).toBe('queued');
  });

  it('puts a card with a closing reason in closed even when its phase lags', () => {
    expect(rollupCardColumn(card('in_progress', { closed_reason: 'dup' }), [], [])).toBe(
      'closed',
    );
  });

  it('keeps a closed card closed while a question or review waits', () => {
    const closed = card('closed', { closed_reason: 'duplicate of SF-C3' });

    expect(rollupCardColumn(closed, [t(1, 'in_progress')], [asked('SF-1')])).toBe(
      'closed',
    );

    expect(rollupCardColumn(closed, [t(1, 'review')], [])).toBe('closed');
    expect(rollupCardColumn(card('closed', { needs_you: true }), [], [])).toBe('closed');
  });
});

describe('cardNeedsYou', () => {
  it('is true for the own flag, a waiting ticket or a pending question, and false otherwise', () => {
    expect(cardNeedsYou({ needs_you: true }, [], [])).toBe(true);
    expect(cardNeedsYou({ needs_you: false }, [t(1, 'waiting_human')], [])).toBe(true);
    expect(
      cardNeedsYou({ needs_you: false }, [t(1, 'in_progress')], [asked('SF-1')]),
    ).toBe(true);

    expect(cardNeedsYou({ needs_you: false }, [t(1, 'in_progress')], [])).toBe(false);
  });

  it('counts a blocked ticket (a question that timed out) as needing the owner', () => {
    expect(cardNeedsYou({ needs_you: false }, [t(1, 'blocked')], [])).toBe(true);
  });
});

describe('rollupCardColumn: properties', () => {
  const statuses = fc.array(fc.constantFrom(...TicketStatus.options), { maxLength: 8 });
  const phases = fc.constantFrom(...CARD_PHASES);
  const ticketsOf = (list: Ticket['status'][]) => list.map((s, i) => t(i + 1, s));

  it('is needs_you whenever a ticket waits on a person and the card is not closed', () => {
    fc.assert(
      fc.property(
        phases.filter((p) => p !== 'closed'),
        statuses,
        fc.constantFrom('waiting_human', 'review', 'needs_signoff'),
        (phase, list, w) => {
          expect(rollupCardColumn(card(phase), ticketsOf([...list, w]), [])).toBe(
            'needs_you',
          );
        },
      ),
    );
  });

  it('is closed exactly when the phase is closed or a reason is set', () => {
    fc.assert(
      fc.property(phases, fc.boolean(), fc.boolean(), (phase, reason, flag) => {
        const c = card(phase, {
          needs_you: flag,
          ...(reason ? { closed_reason: 'r' } : {}),
        });

        expect(rollupCardColumn(c, [], []) === 'closed').toBe(
          phase === 'closed' || reason,
        );
      }),
    );
  });

  it('does not depend on the order of the tickets', () => {
    fc.assert(
      fc.property(phases, statuses, (phase, list) => {
        expect(rollupCardColumn(card(phase), ticketsOf([...list].reverse()), [])).toBe(
          rollupCardColumn(card(phase), ticketsOf(list), []),
        );
      }),
    );
  });
});
