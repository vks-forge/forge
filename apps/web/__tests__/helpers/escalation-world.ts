/**
 * Fixtures for ticket escalations: the three kinds as the server sends them, and a small stateful
 * "world" whose routes agree with each other.
 *
 * Why: the same escalation shows in the card chat, on the Ticket page and in the Inbox, and the
 *   point of the feature is that acting in one place settles all three. A test therefore needs one
 *   server state behind all of those routes: acting through `POST /interactions/:id/act` settles
 *   the item, and the card list, the ticket detail and the inbox then read that same state on
 *   their next fetch. The world can also play a second writer (`settleElsewhere`) and stage the
 *   server's refusals (dependents, still broken). Shapes follow the S4a contract in
 *   docs/briefs/s4a-ticket-escalations.md, so a drift between contract and UI fails a test.
 *
 * Exports: questionView(), failureView(), setupView(), FAILURE_ACTIONS, escalationWorld(), EscalationWorld.
 * Depends on: helpers/fetch-stub, helpers/forge-data/ticket-fixtures. No IO.
 */

import type { Routes, StubResponse } from '#tests/helpers/fetch-stub.js';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import type { SampleTicket } from '#tests/helpers/forge-data/ticket-data.types.js';
import { buildSampleTickets } from '#tests/helpers/forge-data/ticket-fixtures.js';

type Raw = Record<string, unknown>;

const at = (minutesAgo: number): string =>
  new Date(Date.now() - minutesAgo * 60_000).toISOString();

/** The action tables of the contract, per failure cause. */
export const FAILURE_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  lane_hold: ['run_as_express', 'replan', 'cancel'],
  rework_cap: ['retry', 'replan', 'cancel'],
  retry_cap: ['retry', 'replan', 'cancel'],
  rewake_cap: ['retry', 'replan', 'cancel'],
  not_retried: ['retry', 'replan', 'cancel'],
  max_turns: ['retry', 'replan', 'cancel'],
  refused: ['retry', 'replan', 'cancel'],
  question_timeout: ['retry', 'replan', 'cancel'],
};

function base(over: Raw): Raw {
  return {
    id: 'int-q1',
    ticket_id: 'SVC-4',
    ticket_title: 'Report window',
    card_id: 'FG-C9',
    stage: 'owner',
    status: 'pending',
    asked_at: at(20),
    escalated_at: at(18),
    ...over,
  };
}

export function questionView(over: Raw = {}): Raw {
  return base({
    kind: 'question',
    payload: {
      kind: 'question',
      text: 'Should the report window use UTC or the account time zone?',
      source: 'ask_director',
      suggested_answer: 'Use UTC; the plan keeps all reports in UTC.',
      options: [
        { id: 'o1', label: 'UTC', recommended: true },
        { id: 'o2', label: 'Account time zone', recommended: false },
      ],
      director_note: 'The plan does not say which one the owner prefers.',
    },
    actions: ['answer', 'cancel'],
    ...over,
  });
}

export function failureView(cause: string, over: Raw = {}): Raw {
  return base({
    id: `int-f-${cause}`,
    kind: 'failure',
    payload: {
      kind: 'failure',
      cause,
      summary: `The ticket stopped (${cause}).`,
      diagnosis: 'The test run fails on a missing fixture.',
      attempts: [
        { at: at(30), what: 'First run', result: 'crashed' },
        { at: at(25), what: 'Director retry', result: 'crashed again' },
      ],
      lane: 'standard',
    },
    actions: [...(FAILURE_ACTIONS[cause] ?? ['cancel'])],
    ...over,
  });
}

export function setupView(over: Raw = {}): Raw {
  return base({
    id: 'int-s1',
    kind: 'setup',
    payload: {
      kind: 'setup',
      cause: { type: 'login', harness_id: 'claude-code' },
      summary: 'The claude-code harness is not signed in.',
      fix_href: '/settings/harnesses/claude-code#tools',
    },
    actions: ['recheck', 'cancel'],
    ...over,
  });
}

export interface EscalationWorld {
  readonly routes: Routes;
  /** The current state of every item, as the server holds it. */
  readonly views: Map<string, Raw>;
  /** Plays another writer: settles an item as if acted on elsewhere. */
  settleElsewhere(id: string, action?: string, by?: string): void;
}

/** One server state behind the card list, `act`, the ticket detail and the inbox. */
export function escalationWorld(
  initial: readonly Raw[],
  options: {
    /** Tickets that block a plain cancel, until `cascade` is sent. */
    dependents?: readonly string[];
    /** Makes `recheck` refuse with this detail. */
    stillBroken?: string;
    /** `wait_actions` per ticket id for waits with no escalation. */
    waitActions?: Readonly<Record<string, readonly string[]>>;
    /** Status to give a ticket in the detail (review, needs_signoff, ...). */
    ticketStatus?: Readonly<Record<string, string>>;
    /** Extra routes for a refusal on the ticket-level act. */
    ticketAct?: StubResponse;
  } = {},
): EscalationWorld {
  const views = new Map<string, Raw>(initial.map((view) => [String(view['id']), view]));
  const tickets = new Map<string, SampleTicket>(
    buildSampleTickets().map((item) => [item.ticket.id, item]),
  );

  const settle = (id: string, action: string, by: string): Raw | undefined => {
    const found = views.get(id);
    if (found === undefined) {
      return undefined;
    }

    const next = { ...found, status: 'answered', settled: { action, by, at: at(0) } };
    views.set(id, next);

    return next;
  };

  const pending = (view: Raw): boolean => view['settled'] === undefined;
  const forTicket = (ticketId: string): Raw[] =>
    [...views.values()].filter((view) => view['ticket_id'] === ticketId && pending(view));

  const inboxItems = (): Raw[] =>
    [...views.values()]
      .filter((view) => pending(view) && view['stage'] === 'owner')
      .map((view) => ({
        id: `question:${String(view['id'])}`,
        kind: 'question',
        project: 'sample-service',
        title: `${String(view['ticket_id'])}: ${String(view['ticket_title'])}`,
        detail: String(view['ticket_id']),
        ticket_id: view['ticket_id'],
        needs_action: true,
        updated_at: String(view['escalated_at'] ?? view['asked_at']),
        read: false,
        archived: false,
        escalation: view,
      }));

  const routes: Routes = {
    'GET /cards/:id/escalations': ({ params }) => {
      const mine = [...views.values()].filter((view) => view['card_id'] === params['id']);

      return json({
        items: [...mine.filter(pending), ...mine.filter((view) => !pending(view))],
      });
    },

    'POST /interactions/:id/act': ({ params, body }) => {
      const id = params['id']!;
      const found = views.get(id);
      const input = body as Raw;
      const action = String(input['action']);

      if (found === undefined) {
        return refusal(404, 'interaction_not_found', `No interaction ${id}.`);
      }

      if (!pending(found)) {
        return refusal(409, 'not_pending', `interaction ${id} is not pending`);
      }

      if (!(found['actions'] as string[]).includes(action)) {
        return refusal(409, 'action_not_offered', `${action} is not offered`);
      }

      // The server's own rule for an overrule: a reason of at least five characters (S5c-A).
      if (
        (action === 'merge_anyway' || action === 'continue') &&
        String(input['comment'] ?? '').trim().length < 5
      ) {
        return refusal(400, 'invalid_body', 'comment must be at least 5 characters');
      }

      if (
        action === 'cancel' &&
        input['cascade'] !== true &&
        (options.dependents?.length ?? 0) > 0
      ) {
        return {
          status: 409,
          body: {
            error: {
              code: 'ticket_has_dependents',
              message: 'other tickets depend on this one',
              dependents: options.dependents,
            },
          },
        };
      }

      if (action === 'recheck' && options.stillBroken !== undefined) {
        return {
          status: 409,
          body: {
            error: {
              code: 'still_broken',
              message: 'still broken',
              detail: options.stillBroken,
            },
          },
        };
      }

      return json({ escalation: settle(id, action, 'owner') });
    },

    'POST /tickets/:id/act':
      options.ticketAct ??
      (({ params, body }) =>
        json({ ticket_id: params['id'], action: (body as Raw)['action'] })),

    'GET /tickets/:id': ({ params }) => {
      const item = tickets.get(params['id']!);
      if (item === undefined) {
        return refusal(404, 'not_found', `No ticket ${params['id']}.`);
      }

      const status = options.ticketStatus?.[item.ticket.id];

      return json({
        ticket: status === undefined ? item.ticket : { ...item.ticket, status },
        runs: [...item.runs],
        gate_results: [...item.gates],
        interactions: [],
        wait_reason: item.waitReason,
        escalations: forTicket(item.ticket.id),
        wait_actions: [...(options.waitActions?.[item.ticket.id] ?? [])],
      });
    },

    'GET /projects/:slug/inbox': () => json({ items: inboxItems(), nextCursor: null }),
    'GET /projects/:slug/inbox/counts': () => {
      const n = inboxItems().length;

      return json({ needs_action: n, unread: n, all: n, archived: 0 });
    },
  };

  return {
    routes,
    views,
    settleElsewhere: (id, action = 'answer', by = 'owner') => {
      settle(id, action, by);
    },
  };
}
