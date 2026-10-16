/**
 * Tests for the card-flow schemas: the reply queue rows, the card id on a question, the
 * relation edge and the card summary's new fields.
 *
 * Why: the Director's owed replies and card dependencies are parsed at every boundary (a
 *   storage row, an HTTP body). A queue row with an unknown reason, an edge that is not a
 *   `depends_on`, or a question naming something that is not a card id would reach the engine
 *   unvalidated; and the card summary the web client reads must carry the contract fields.
 *
 * Pins: queue reasons and row shape, relation kind, `Interaction.card_id` optional and
 *   validated, the new Board columns, and the summary's dependency fields.
 * Depends on: src/schemas/*, vitest.
 */

import { describe, expect, it } from 'vitest';
import { CARD_COLUMNS, CardRelation } from '#/schemas/card.js';
import { CardSummary } from '#/schemas/card-api.js';
import { CardReplyQueueItem, NewCardReply } from '#/schemas/card-reply-queue.js';
import { Interaction } from '#/schemas/interaction.js';

const T = '2026-10-16T00:00:00.000Z';

describe('card reply queue rows', () => {
  const reply = { card_id: 'SF-C1', event_id: 0, reason: 'card_created', enqueued_at: T };

  it('accepts a new reply and a stored row with claim and completion stamps', () => {
    expect(NewCardReply.safeParse(reply).success).toBe(true);
    expect(
      CardReplyQueueItem.safeParse({ ...reply, id: 3, claimed_at: T, done_at: T })
        .success,
    ).toBe(true);
  });

  it('refuses an unknown reason, a bad card id, a negative event and a zero row id', () => {
    expect(NewCardReply.safeParse({ ...reply, reason: 'cron' }).success).toBe(false);
    expect(NewCardReply.safeParse({ ...reply, card_id: 'SF-1' }).success).toBe(false);
    expect(NewCardReply.safeParse({ ...reply, event_id: -1 }).success).toBe(false);
    expect(CardReplyQueueItem.safeParse({ ...reply, id: 0 }).success).toBe(false);
  });
});

describe('card relation', () => {
  it('is a depends_on edge between two card ids', () => {
    expect(
      CardRelation.safeParse({ from: 'SF-C1', to: 'SF-C2', kind: 'depends_on' }).success,
    ).toBe(true);

    expect(
      CardRelation.safeParse({ from: 'SF-C1', to: 'SF-C2', kind: 'blocks' }).success,
    ).toBe(false);

    expect(
      CardRelation.safeParse({ from: 'SF-1', to: 'SF-C2', kind: 'depends_on' }).success,
    ).toBe(false);
  });
});

describe('Interaction.card_id', () => {
  const question = {
    id: 'i1',
    ticket_id: 'SF-1',
    kind: 'question',
    payload: {},
    status: 'pending',
    asked_at: T,
    timeout_at: T,
  };

  it('is optional and, when present, must be a card id', () => {
    expect(Interaction.safeParse(question).success).toBe(true);
    expect(Interaction.safeParse({ ...question, card_id: 'SF-C1' }).success).toBe(true);
    expect(Interaction.safeParse({ ...question, card_id: 'SF-1' }).success).toBe(false);
  });
});

describe('board columns and the card summary', () => {
  it('lists the columns of d-0139 and drops New', () => {
    expect([...CARD_COLUMNS]).toEqual([
      'shaping',
      'needs_you',
      'queued',
      'in_progress',
      'done',
      'closed',
    ]);
  });

  it('requires the dependency lists and the column on a summary', () => {
    const summary = {
      id: 'SF-C1',
      project: 'sf',
      type: 'plan',
      title: 'T',
      summary: 's',
      source: { kind: 'chat', ref: 'm' },
      created_by: { type: 'user', id: 'u' },
      created_at: T,
      updated_at: T,
      phase: 'grilling',
      phase_version: 0,
      needs_you: false,
      priority: 'normal',
      links: [],
      column: 'shaping',
      depends_on: [],
      blocks: ['SF-C2'],
      ticket_count: 0,
      tickets_done: 0,
    };

    expect(CardSummary.safeParse(summary).success).toBe(true);
    expect(CardSummary.safeParse({ ...summary, depends_on: undefined }).success).toBe(
      false,
    );

    expect(CardSummary.safeParse({ ...summary, blocks: ['SF-2'] }).success).toBe(false);
    expect(CardSummary.safeParse({ ...summary, column: 'new' }).success).toBe(false);
  });
});
