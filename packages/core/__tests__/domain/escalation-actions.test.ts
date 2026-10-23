/**
 * Rule test: no waiting state of a ticket is a dead end.
 *
 * Why: the owner can only act on what the screen offers, so a ticket that waits with no action is
 *   stuck until someone edits the database (d-0135). Every wait on a person or the scheduler maps
 *   to at least one action, with and without a card; an unmapped status or cause fails here.
 * Pins: the action table (order is button order), replan only for a card that is not a Discussion,
 *   every cause, kind (permission too), status, wait kind and card phase has an action.
 * Depends on: src/domain/escalation-actions, src/schemas/*, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  FAILURE_ACTIONS,
  SCHEDULER_WAIT_KINDS,
  STATUS_WAIT_CLASS,
  escalationActions,
  ticketWaitActions,
} from '#/domain/escalation-actions.js';
import { NEEDS_YOU_ACTIONS } from '#/schemas/card-event.js';
import { CARD_PHASES } from '#/schemas/card.js';
import {
  DECISION_CAUSES,
  EscalationAction,
  EscalationKind,
  FailureCause,
} from '#/schemas/escalation.js';
import type { EscalationPayload } from '#/schemas/escalation.js';
import { SetupCause } from '#/schemas/escalation-setup.js';
import { Tier, TicketStatus } from '#/schemas/ticket.js';
import type { EscalationBase } from '#/types/escalation.types.js';
import {
  decisionPayload,
  permissionPayload,
  signOffPayload,
  worktreeSetupCause,
} from '#tests/helpers/escalation-payloads.js';

const AT = '2026-10-17T00:00:00.000Z';

const setupCauses = {
  login: { type: 'login', harness_id: 'claude-code' },
  tool: {
    type: 'tool',
    tool: 'read',
    harness_kind: 'claude',
    version: '1.0.0',
    reason_code: 'schema_pending',
  },
  harness_build: { type: 'harness_build', harness_kind: 'claude', version: '1.0.1' },
  worktree_setup: worktreeSetupCause,
} as const;

function payloadOf(kind: EscalationKind, detail?: string): EscalationPayload {
  if (kind === 'question') {
    return {
      kind,
      text: 'Which one?',
      source: 'ask_director',
      options: [],
    };
  }

  if (kind === 'failure') {
    return {
      kind,
      cause: detail as FailureCause,
      summary: 'it failed',
      attempts: [],
    };
  }

  return {
    kind: 'setup',
    cause: setupCauses[detail as keyof typeof setupCauses],
    summary: 'fix it',
    fix_href: '/settings/harnesses/claude-code',
  };
}

const pendingView = (payload: EscalationPayload): EscalationBase => ({
  id: 'int-1',
  ticket_id: 'SF-1' as EscalationBase['ticket_id'],
  kind: payload.kind,
  stage: 'owner',
  status: 'pending',
  payload,
  asked_at: AT,
  escalated_at: AT,
});

describe('action tables', () => {
  it('offers answer and cancel for a question', () => {
    expect(escalationActions(payloadOf('question'), { replannable: true })).toEqual([
      'answer',
      'cancel',
    ]);
  });

  it('offers run_as_express, replan, cancel for a lane hold', () => {
    expect(
      escalationActions(payloadOf('failure', 'lane_hold'), { replannable: true }),
    ).toEqual(['run_as_express', 'replan', 'cancel']);
  });

  it.each(FailureCause.options.filter((c) => c !== 'lane_hold'))(
    'offers retry, replan, cancel for %s',
    (cause) => {
      expect(
        escalationActions(payloadOf('failure', cause), { replannable: true }),
      ).toEqual(['retry', 'replan', 'cancel']);
    },
  );

  it('drops replan when the ticket has no card to re-plan', () => {
    expect(
      escalationActions(payloadOf('failure', 'retry_cap'), { replannable: false }),
    ).toEqual(['retry', 'cancel']);

    expect(
      escalationActions(payloadOf('failure', 'lane_hold'), { replannable: false }),
    ).toEqual(['run_as_express', 'cancel']);
  });

  it('offers retry, replan, cancel for a merge conflict', () => {
    expect(FAILURE_ACTIONS.merge_conflict).toEqual(['retry', 'replan', 'cancel']);
  });

  it('has a row for every failure cause and nothing else', () => {
    expect(Object.keys(FAILURE_ACTIONS).sort()).toEqual([...FailureCause.options].sort());
  });
});

describe('ticket waits', () => {
  it('offers approve, rework and cancel for review (tier B)', () => {
    expect(ticketWaitActions({ status: 'review', replannable: true }, [], null)).toEqual([
      'approve',
      'rework',
      'cancel',
    ]);
  });

  it('offers sign_off, rework and cancel for sign-off (tier C)', () => {
    expect(
      ticketWaitActions({ status: 'needs_signoff', replannable: true }, [], null),
    ).toEqual(['sign_off', 'rework', 'cancel']);
  });

  it('offers cancel while the scheduler holds a ticket back', () => {
    expect(
      ticketWaitActions({ status: 'planned', replannable: true }, [], 'deps: FG-2'),
    ).toEqual(['cancel']);
  });

  it('offers nothing for a ticket that is simply running or finished', () => {
    expect(
      ticketWaitActions({ status: 'in_progress', replannable: true }, [], null),
    ).toEqual([]);

    expect(ticketWaitActions({ status: 'done', replannable: true }, [], null)).toEqual(
      [],
    );
  });

  it('uses the pending owner escalation for a waiting ticket and drops duplicates', () => {
    const view = pendingView(payloadOf('failure', 'retry_cap'));
    const again = { ...view, id: 'int-2' };

    expect(
      ticketWaitActions(
        { status: 'waiting_human', replannable: true },
        [view, again],
        null,
      ),
    ).toEqual(['retry', 'replan', 'cancel']);
  });

  it('keeps cancel for a waiting ticket whose escalation is still with the Director', () => {
    const { escalated_at: _gone, ...rest } = pendingView(payloadOf('question'));
    void _gone;
    const view: EscalationBase = { ...rest, stage: 'director' };

    expect(
      ticketWaitActions({ status: 'waiting_human', replannable: true }, [view], null),
    ).toEqual(['cancel']);
  });
});

describe('no dead ends', () => {
  const failureCauses = FailureCause.options.map((c) => payloadOf('failure', c));
  const setups = SetupCause.options.map((o) => payloadOf('setup', o.shape.type.value));

  const decisions = DECISION_CAUSES.map((c) => decisionPayload(c));
  const signOffs = Tier.options.map((t) => signOffPayload(t));

  const payloads: EscalationPayload[] = [
    payloadOf('question'),
    ...failureCauses,
    ...setups,
    ...decisions,
    ...signOffs,
    permissionPayload(true),
    permissionPayload(false),
  ];

  it('covers every escalation kind', () => {
    expect(new Set(payloads.map((p) => p.kind))).toEqual(new Set(EscalationKind.options));
  });

  it('gives every escalation at least one action, with and without a card', () => {
    for (const payload of payloads) {
      for (const replannable of [true, false]) {
        const actions = escalationActions(payload, { replannable });

        expect(actions.length).toBeGreaterThan(0);
        for (const a of actions) {
          expect(EscalationAction.options).toContain(a);
        }
      }
    }
  });

  it('classifies every ticket status and gives each waiting one an action', () => {
    expect(Object.keys(STATUS_WAIT_CLASS).sort()).toEqual(
      [...TicketStatus.options].sort(),
    );

    for (const status of TicketStatus.options) {
      for (const replannable of [true, false]) {
        const ticket = { status, replannable };
        const klass = STATUS_WAIT_CLASS[status];
        if (klass === 'owner') {
          for (const p of payloads) {
            expect(
              ticketWaitActions(ticket, [pendingView(p)], null).length,
              `${status} ${p.kind}`,
            ).toBeGreaterThan(0);
          }

          expect(ticketWaitActions(ticket, [], null).length).toBeGreaterThan(0);
        } else if (klass === 'review') {
          expect(ticketWaitActions(ticket, [], null).length).toBeGreaterThan(0);
        } else if (klass === 'scheduler') {
          for (const kind of SCHEDULER_WAIT_KINDS) {
            expect(ticketWaitActions(ticket, [], `${kind}: x`).length).toBeGreaterThan(0);
          }
        } else {
          expect(ticketWaitActions(ticket, [], null)).toEqual([]);
        }
      }
    }
  });

  it('keeps the card needs-you actions non-empty', () => {
    expect(CARD_PHASES.length).toBeGreaterThan(0);
    expect(NEEDS_YOU_ACTIONS.length).toBeGreaterThan(0);
  });

  it('lists the budget stop actions, each a way forward (raise the cap, retry now)', () => {
    expect(NEEDS_YOU_ACTIONS).toContain('raise_step_budget');
    expect(NEEDS_YOU_ACTIONS).toContain('retry_step');
  });

  it('holds for any combination (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TicketStatus.options),
        fc.constantFrom(...payloads),
        fc.boolean(),
        fc.constantFrom(null, ...SCHEDULER_WAIT_KINDS.map((k) => `${k}: x`)),
        (status, payload, replannable, wait) => {
          const klass = STATUS_WAIT_CLASS[status];
          const actions = ticketWaitActions(
            { status, replannable },
            klass === 'owner' ? [pendingView(payload)] : [],
            wait,
          );

          if (klass === 'owner' || klass === 'review') {
            expect(actions.length).toBeGreaterThan(0);
          }

          if (klass === 'scheduler' && wait !== null) {
            expect(actions.length).toBeGreaterThan(0);
          }

          if (klass === 'none') {
            expect(actions).toEqual([]);
          }

          expect(new Set(actions).size).toBe(actions.length);
        },
      ),
    );
  });
});
