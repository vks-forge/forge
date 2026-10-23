/**
 * Tests for buildCardHistory and pageHistory.
 *
 * Why: a card's History tab must read as one story: the owner's words, the Director's plan, then
 *   each ticket as a single line that leads to the ticket's own history. Paging must never drop an
 *   entry at a page edge, or a long card would silently lose lines.
 *
 * Pins: card phases in full, one roll-up line per ticket event with the ticket link, same-instant
 *   entries kept together across a page edge, newest page first with a cursor, and the limit cap.
 * Depends on: src/domain/history-card, helpers/history-fixtures, vitest.
 */

import { describe, expect, it } from 'vitest';
import { buildCardHistory, pageHistory } from '#/domain/history-card.js';
import type { HistoryEntry } from '#/schemas/history.js';
import { at, ev } from '#tests/helpers/history-fixtures.js';

describe('buildCardHistory', () => {
  it('shows card phases in full and each ticket event as one roll-up line', () => {
    const user = { type: 'user', id: 'owner' };
    const entries = buildCardHistory({
      events: [
        ev(0, 'user_message', { text: 'Add login' }, user),
        ev(10, 'plan_ready', {
          version: 1,
          ticket_count: 2,
          auto_approve_eligible: false,
        }),
        ev(20, 'ticket_created', { ticket_id: 'CHE-1', title: 'Login form' }),
        ev(30, 'ticket_state', {
          ticket_id: 'CHE-1',
          from: 'planned',
          to: 'in_progress',
          reason: 'A Worker started',
        }),
        ev(40, 'interaction_opened', {
          ticket_id: 'CHE-1',
          interaction_id: 'i1',
          interaction_kind: 'question',
        }),
      ],
    });

    expect(entries.map((e) => e.title)).toEqual([
      'You wrote',
      'Plan v1 is ready (2 tickets)',
      'CHE-1 created: Login form',
      'CHE-1: A Worker started',
    ]);

    expect(entries[3]).toMatchObject({
      ticket_id: 'CHE-1',
      from: 'planned',
      to: 'in_progress',
    });

    expect(entries[0]?.actor.type).toBe('owner');
  });
});

const line = (sec: number, title: string): HistoryEntry => ({
  at: at(sec),
  kind: 'note',
  actor: { type: 'engine' },
  title,
  links: {},
});

describe('pageHistory', () => {
  const all = [line(0, 'a'), line(1, 'b'), line(2, 'c'), line(3, 'd'), line(4, 'e')];

  it('returns the newest entries, oldest first, with a cursor to older ones', () => {
    const page = pageHistory(all, { limit: 2 });

    expect(page.entries.map((e) => e.title)).toEqual(['d', 'e']);
    expect(page).toMatchObject({ has_more: true, next_before: at(3) });
  });

  it('pages back with the cursor and ends without one', () => {
    const second = pageHistory(all, { limit: 2, before: at(3) });
    const last = pageHistory(all, { limit: 5, before: at(2) });

    expect(second.entries.map((e) => e.title)).toEqual(['b', 'c']);
    expect(last).toEqual({ entries: [all[0], all[1]], has_more: false });
  });

  it('never splits entries of the same instant across pages', () => {
    const tied = [line(0, 'a'), line(1, 'b'), line(1, 'c'), line(2, 'd')];

    const page = pageHistory(tied, { limit: 2 });

    expect(page.entries.map((e) => e.title)).toEqual(['b', 'c', 'd']);
    expect(page.next_before).toBe(at(1));
  });
});
