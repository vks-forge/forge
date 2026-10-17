/**
 * Fixtures for the card-first planning flow: a card in any phase, its Director events, a stored
 * plan, and the stub routes that serve them and record the owner's actions.
 *
 * Why: the grill, the banner and the Plan tab are driven by events and by a plan the server
 *   stores; their tests need a card whose history and plan they control, and every POST the UI
 *   makes must be observable (what was sent, and what a refusal looks like). One builder keeps
 *   the event and plan shapes in the shapes of docs/briefs/s2-director-planning.md, so a drift
 *   between the contract and the UI fails a test instead of passing against a stale fixture.
 *
 * Exports: FLOW_CARD, flowEvent(), planFixture(), flowDetail(), flowRoutes(), FlowRoutesOptions.
 * Depends on: helpers/fetch-stub. No IO.
 */

import { json, refusal } from '#tests/helpers/fetch-stub.js';
import type { Routes, StubResponse } from '#tests/helpers/fetch-stub.js';

export const FLOW_CARD = 'FG-C9';

const at = (minutesAgo: number): string =>
  new Date(Date.now() - minutesAgo * 60_000).toISOString();

export function flowEvent(
  seq: number,
  kind: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    seq,
    kind,
    at: at(100 - seq),
    actor: { type: kind === 'grill_answer' ? 'user' : 'director', id: 'x' },
    payload,
  };
}

/** A plan with three tickets: t2 waits for t1, t3 for both. */
export function planFixture(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    card_id: FLOW_CARD,
    version: 1,
    created_at: at(30),
    author: 'director',
    config_version: 0,
    base_sha: 'abc123',
    goal: 'Retry failed webhook sends with backoff',
    scope: ['Retry up to three times', 'Exponential backoff'],
    non_goals: ['A dead-letter queue'],
    decisions: [{ question: 'How many retries?', answer: 'Three' }],
    assumptions: ['Webhook targets are idempotent'],
    verification: {
      blast_radius: 'Only the webhook sender module',
      files_read: ['src/webhooks/send.ts', 'src/webhooks/queue.ts'],
      overlaps: [{ card_id: 'FG-C4', files: ['src/webhooks/queue.ts'] }],
      matching_decisions: ['d-0042 keeps retries in the sender'],
      rejected_hits: ['r-0007 rejected a separate retry service'],
      risks: ['Duplicate sends if a target is not idempotent'],
    },
    tickets: [
      {
        key: 't1',
        title: 'Add a retry policy type',
        body: 'Define the policy and its defaults',
        acceptance: ['Policy has a max attempts', 'Defaults are documented'],
        priority: 'normal',
        depends_on: [],
        lane: 'express',
        size: 'S',
        files: ['src/webhooks/policy.ts'],
      },
      {
        key: 't2',
        title: 'Wire the policy into the sender',
        body: 'Use the policy on every send',
        acceptance: ['Failed sends retry'],
        priority: 'high',
        depends_on: ['t1'],
        lane: 'standard',
        size: 'M',
        files: ['src/webhooks/send.ts'],
      },
      {
        key: 't3',
        title: 'Document the behaviour',
        body: 'Write the docs',
        acceptance: ['Docs mention backoff'],
        priority: 'low',
        depends_on: ['t1', 't2'],
        lane: 'standard',
        size: 'S',
        files: [],
      },
    ],
    card_links: ['FG-C4'],
    enhance_report: '',
    ...over,
  };
}

export function flowDetail(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: FLOW_CARD,
    project: 'sample-service',
    type: 'issue',
    title: 'Retry failed webhook sends',
    summary: '',
    source: { kind: 'chat', ref: 'web' },
    created_by: { type: 'user', id: 'owner' },
    created_at: at(120),
    updated_at: at(1),
    ticket_count: 0,
    tickets_done: 0,
    column: 'shaping',
    phase: 'grilling',
    needs_you: false,
    phase_version: 1,
    priority: 'normal',
    links: [],
    depends_on: [],
    blocks: [],
    tickets: [],
    pending_interactions: [],
    director: { state: 'idle' },
    ...over,
  };
}

export interface FlowRoutesOptions {
  readonly detail?: Record<string, unknown>;
  readonly events?: readonly Record<string, unknown>[];
  readonly plan?: {
    readonly versions?: readonly { version: number; created_at: string }[];
    readonly current?: Record<string, unknown> | null;
    readonly floor?: unknown;
  };
  /** Stored versions served by `GET /cards/:id/plan/:version`. */
  readonly versions?: Readonly<Record<number, Record<string, unknown>>>;
  /** Answers per action route, e.g. a 409 refusal; default is 200 `{}`. */
  readonly answers?: Readonly<Record<string, StubResponse>>;
}

const ok: StubResponse = { status: 200, body: {} };

/** Routes for one card in the flow; every POST and PATCH is answered from `answers` or 200. */
export function flowRoutes(options: FlowRoutesOptions = {}): Routes {
  const events = options.events ?? [];
  const plan = options.plan ?? {};
  const answer = (key: string): StubResponse => options.answers?.[key] ?? ok;

  return {
    'GET /cards/:id': json(flowDetail(options.detail)),
    'GET /cards/:id/events': ({ query }) => {
      const after = query.get('after');
      const desc = query.get('order') === 'desc';
      const window = events.filter(
        (e) => after === null || (e['seq'] as number) > Number(after),
      );

      return json({ items: desc ? [...window].reverse() : window, nextCursor: null });
    },
    'GET /cards/:id/plan': json({
      versions: plan.versions ?? [],
      current: plan.current ?? null,
      floor: plan.floor ?? null,
    }),
    'GET /cards/:id/plan/:version': ({ params }) => {
      const found = options.versions?.[Number(params['version'])];

      return found
        ? json({ plan: found })
        : refusal(404, 'plan_version_not_found', 'No such version.');
    },
    'POST /cards/:id/grill/answer': answer('grill_answer'),
    'POST /cards/:id/grill/shortcut': answer('grill_shortcut'),
    'POST /cards/:id/plan/approve': answer('approve'),
    'POST /cards/:id/plan/request-changes': answer('request_changes'),
    'PATCH /cards/:id/plan/:version/tickets': answer('edit_tickets'),
    'POST /cards/:id/start-planning': answer('start_planning'),
    'POST /cards/:id/planning/retry': answer('retry_step'),
    'POST /tickets/:id/run-as-express': answer('run_as_express'),
  };
}
