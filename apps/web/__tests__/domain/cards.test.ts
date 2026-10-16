/**
 * Pins: card columns group by the server's rolled-up column and filter by type and text; chat
 * lines are derived defensively from history events (unknown kinds become notes, odd payloads
 * never throw); a reply is "awaited" exactly while the user's message is the newest speech; a
 * Worker `user_message` run event folds into a user line; steer refusals map to plain words.
 *
 * Why: these pure functions decide what the Board and the Card chat say. A card in two columns,
 *   a crash on a payload from a newer Director, or a "thinking" poll that never stops would
 *   each be invisible in review and loud in use.
 * Depends on: domain/card-columns, domain/card-chat, domain/thread, domain/steer-errors.
 */

import { describe, expect, it } from 'vitest';
import { ApiError } from '#/api/api-error.js';
import { awaitingReply, lineOf } from '#/domain/card-chat.js';
import { filterCards, groupCards, isCardFilterActive } from '#/domain/card-columns.js';
import { describeSteerError } from '#/domain/steer-errors.js';
import { applyEvent, EMPTY_THREAD } from '#/domain/thread.js';
import type { CardHistoryEvent, CardSummary } from '#/schemas/cards.js';
import { SAMPLE_CARDS } from '#tests/helpers/forge-data/card-data.js';

const cards: readonly CardSummary[] = SAMPLE_CARDS.map((c) => c.summary);
const event = (
  seq: number,
  kind: string,
  payload: Record<string, unknown> = {},
): CardHistoryEvent => ({
  seq,
  kind,
  at: '2026-10-16T10:00:00.000Z',
  actor: { type: 'system', id: 'forge' },
  payload,
});

describe('card columns', () => {
  it('puts every card in exactly one column, the one the server sent', () => {
    const groups = groupCards(cards);

    expect(Object.values(groups).flat()).toHaveLength(cards.length);
    expect(groups.needs_you.map((c) => c.id)).toEqual(['FG-C3']);
    expect(groups.closed.map((c) => c.id)).toEqual(['FG-C6']);
  });

  it('filters by type and by id or title, case-insensitively', () => {
    expect(filterCards(cards, { type: 'plan', query: '' })).toHaveLength(1);
    expect(filterCards(cards, { type: 'all', query: 'CSV' }).map((c) => c.id)).toEqual([
      'FG-C4',
    ]);

    expect(filterCards(cards, { type: 'all', query: 'fg-c5' })).toHaveLength(1);
    expect(isCardFilterActive({ type: 'all', query: '  ' })).toBe(false);
    expect(isCardFilterActive({ type: 'plan', query: '' })).toBe(true);
  });
});

describe('card chat lines', () => {
  it('reads actions the Director took with their outcome, skipping junk', () => {
    const line = lineOf(
      event(1, 'director_message', {
        text: 'Done',
        actions_taken: [
          { action: 'create_ticket', result: 'done', summary: 'Created SVC-9' },
          { action: 'change_type', result: 'refused', summary: 'Type not allowed' },
          42,
          {},
        ],
      }),
    );

    expect(line.tone).toBe('director');
    expect(line.actions).toEqual([
      { text: 'Created SVC-9', result: 'done' },
      { text: 'Type not allowed', result: 'refused' },
    ]);
  });

  it('turns an action event and a close suggestion into lines that say what they are', () => {
    expect(
      lineOf(
        event(1, 'director_action', {
          action: 'steer_run',
          result: 'refused',
          summary: 'No live run',
        }),
      ),
    ).toMatchObject({ action: { text: 'No live run', result: 'refused' } });

    expect(lineOf(event(2, 'close_suggested', { reason: 'All done' }))).toMatchObject({
      closeReason: 'All done',
      text: 'The Director suggests closing this card: All done',
    });
  });

  it('turns an unknown kind into a note and never throws on a bad payload', () => {
    expect(lineOf(event(1, 'brand_new_kind', { text: 'Hello' }))).toMatchObject({
      tone: 'note',
      text: 'Hello',
    });

    expect(lineOf(event(2, 'brand_new_kind', { weird: 1 })).text).toBe(
      'Event: brand new kind',
    );

    expect(lineOf(event(3, 'ticket_state', { from: 7, to: null })).text).toContain(
      'another state',
    );

    expect(lineOf(event(4, 'user_message', {})).text).toBe('(empty message)');
  });

  it('words ticket state changes with the Board’s names', () => {
    const line = lineOf(
      event(1, 'ticket_state', {
        ticket_id: 'SVC-3',
        from: 'planned',
        to: 'in_progress',
      }),
    );

    expect(line.text).toBe('moved from Planned to In progress');
    expect(line.ticketId).toBe('SVC-3');
  });

  it('awaits a reply only while the newest speech is the user’s', () => {
    expect(awaitingReply([])).toBe(false);
    expect(awaitingReply([event(1, 'user_message')])).toBe(true);
    expect(awaitingReply([event(1, 'user_message'), event(2, 'note')])).toBe(true);
    expect(awaitingReply([event(1, 'user_message'), event(2, 'director_message')])).toBe(
      false,
    );
  });
});

describe('steering', () => {
  it('folds a user_message run event into a user line', () => {
    const next = applyEvent(EMPTY_THREAD, {
      type: 'user_message',
      seq: 3,
      ts: '2026-10-16T10:00:00.000Z',
      inbox_seq: 1,
      mode: 'steer',
      author: 'owner',
      text: 'Use chunks',
    });

    expect(next.items).toMatchObject([
      { kind: 'user', author: 'owner', text: 'Use chunks' },
    ]);
  });

  it('maps refusal codes to words and falls back to the general text', () => {
    const refused = (code: string) => new ApiError('http', code, { status: 409, code });

    expect(describeSteerError(refused('run_not_live'))).toMatch(/has ended/);
    expect(describeSteerError(refused('steer_unsupported'))).toMatch(
      /cannot take messages/,
    );

    expect(describeSteerError(refused('server_draining'))).toMatch(/shutting down/);
    expect(describeSteerError(new ApiError('network', 'down'))).toMatch(
      /Cannot reach Forge/,
    );
  });
});
