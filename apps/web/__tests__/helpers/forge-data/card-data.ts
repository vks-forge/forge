/**
 * The sample cards of the component tests: rows, tickets, history and the type registry.
 *
 * Why: the Cards view needs a card in every column that holds cards and the Card page needs the interesting
 *   cases (a talk-only plan with a Director conversation, a card with running tickets, one
 *   with a question waiting, a closed one with a reason). The rows are plainly samples about
 *   an imaginary service. Summaries are checked by core's schemas when the fake server answers,
 *   so a drift in the card shapes fails a test instead of passing against a stale fixture.
 *
 * Exports: SAMPLE_CARDS, SAMPLE_EVENTS, CARD_TYPES, SampleCard.
 * Depends on: @forge/core (BUILTIN_CARD_TYPES, types), helpers/work-fixtures. No IO.
 */

import { BUILTIN_CARD_TYPES } from '@forge/core';
import type { Interaction, TicketSummary } from '@forge/core';
import type { CardSummary } from '#/schemas/cards.js';
import { ticketSummary } from '#tests/helpers/work-fixtures.js';

export interface SampleCard {
  readonly summary: CardSummary;
  readonly tickets: readonly TicketSummary[];
  readonly pending: readonly Interaction[];
}

export const CARD_TYPES = BUILTIN_CARD_TYPES;

const at = (hoursAgo: number): string =>
  new Date(Date.now() - hoursAgo * 3_600_000).toISOString();

function card(
  n: number,
  over: Partial<CardSummary> & Pick<CardSummary, 'title' | 'type' | 'column'>,
): CardSummary {
  return {
    id: `FG-C${n}` as CardSummary['id'],
    project: 'sample-service',
    summary: '',
    source: { kind: 'chat', ref: 'web' },
    created_by: { type: 'user', id: 'owner' },
    created_at: at(48 - n),
    updated_at: at(10 - n),
    ticket_count: 0,
    tickets_done: 0,
    needs_you: over.column === 'needs_you',
    phase_version: 0,
    priority: 'normal',
    links: [],
    depends_on: [],
    blocks: [],
    ...over,
  };
}

const waiting: Interaction = {
  id: 'int-svc-4',
  ticket_id: 'SVC-4',
  kind: 'question',
  payload: { prompt: 'UTC or account time zone?' },
  status: 'pending',
  asked_at: at(1),
  timeout_at: at(-24),
};

export const SAMPLE_CARDS: readonly SampleCard[] = [
  {
    summary: card(1, {
      title: 'Look at webhook retries',
      type: 'discussion',
      column: 'shaping',
      phase: 'grilling',
    }),
    tickets: [],
    pending: [],
  },
  {
    summary: card(2, {
      title: 'Plan a retry strategy for webhooks',
      type: 'plan',
      column: 'shaping',
      phase: 'plan_ready',
      summary: 'Retries with backoff, capped at three attempts.',
    }),
    tickets: [],
    pending: [],
  },
  {
    summary: card(3, {
      title: 'Fix off-by-one in the nightly report',
      type: 'issue',
      column: 'needs_you',
      phase: 'in_progress',
      ticket_count: 1,
    }),
    tickets: [
      ticketSummary({
        id: 'SVC-4' as TicketSummary['id'],
        title: 'Fix off-by-one in the nightly report window',
        state: 'waiting_human',
        needs_you: true,
        card_id: 'FG-C3' as CardSummary['id'],
      }),
    ],
    pending: [waiting],
  },
  {
    summary: card(4, {
      title: 'Stream large CSV exports',
      type: 'issue',
      column: 'in_progress',
      phase: 'in_progress',
      depends_on: ['FG-C5'],
      ticket_count: 3,
      tickets_done: 1,
      budget_cap_usd: 5,
    }),
    tickets: [
      ticketSummary({ card_id: 'FG-C4' as CardSummary['id'] }),
      ticketSummary({
        id: 'SVC-1' as TicketSummary['id'],
        title: 'Retry webhook sends with backoff',
        state: 'done',
        created_at: '2026-10-09T09:00:00.000Z',
        card_id: 'FG-C4' as CardSummary['id'],
      }),
    ],
    pending: [],
  },
  {
    summary: card(5, {
      title: 'Rename retries to maxRetries',
      type: 'issue',
      column: 'done',
      phase: 'done',
      blocks: ['FG-C4'],
      ticket_count: 1,
      tickets_done: 1,
    }),
    tickets: [],
    pending: [],
  },
  {
    summary: card(6, {
      title: 'Should we adopt pnpm?',
      type: 'discussion',
      column: 'closed',
      phase: 'closed',
      closed_reason: 'Decided to keep npm for now.',
    }),
    tickets: [],
    pending: [],
  },
];

/** History by card id, oldest first. FG-C2 holds an unknown event kind on purpose. */
export const SAMPLE_EVENTS: Readonly<Record<string, readonly Record<string, unknown>[]>> =
  {
    'FG-C2': [
      {
        seq: 0,
        kind: 'user_message',
        at: at(5),
        actor: { type: 'user', id: 'owner' },
        payload: { text: 'Can we retry failed webhook sends?' },
      },
      {
        seq: 1,
        kind: 'director_message',
        at: at(4),
        actor: { type: 'director', id: 'director' },
        payload: {
          text: 'Yes. I would retry three times with exponential backoff.',
          actions_taken: [
            { action: 'create_ticket', result: 'done', summary: 'Drafted a plan' },
            { action: 'change_type', result: 'refused', summary: 'Type change refused' },
          ],
        },
      },
      {
        seq: 2,
        kind: 'director_action',
        at: at(3),
        actor: { type: 'director', id: 'director' },
        payload: {
          action: 'steer_run',
          result: 'done',
          summary: 'Asked the planner for a cost estimate',
        },
      },
      {
        seq: 3,
        kind: 'close_suggested',
        at: at(2.5),
        actor: { type: 'director', id: 'director' },
        payload: { reason: 'The plan was folded into FG-C4' },
      },
      {
        seq: 4,
        kind: 'future_kind_from_a_newer_server',
        at: at(2),
        actor: { type: 'system', id: 'forge' },
        payload: { text: 'A newer thing happened' },
      },
      {
        seq: 5,
        kind: 'another_unknown_kind',
        at: at(1),
        actor: { type: 'system', id: 'forge' },
        payload: { weird: [1, 2, 3] },
      },
    ],
    // 120 notes, so the newest window is 50 and older ones load a window at a time.
    'FG-C5': Array.from({ length: 120 }, (_, seq) => ({
      seq,
      kind: 'note',
      at: at(120 - seq / 10),
      actor: { type: 'system', id: 'forge' },
      payload: { text: `Note number ${seq}` },
    })),
    'FG-C4': [
      {
        seq: 0,
        kind: 'ticket_created',
        at: at(6),
        actor: { type: 'director', id: 'director' },
        payload: { ticket_id: 'SVC-3', title: 'Stream large CSV' },
      },
      {
        seq: 1,
        kind: 'ticket_state',
        at: at(5),
        actor: { type: 'system', id: 'engine' },
        payload: { ticket_id: 'SVC-3', from: 'planned', to: 'in_progress' },
      },
    ],
  };
