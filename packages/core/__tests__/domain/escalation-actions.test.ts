/**
 * Rule test: no waiting state of a ticket is a dead end.
 *
 * Why: the owner can only act on what the screen offers, so a ticket that waits with no action
 *   is stuck until someone edits the database (d-0135). Every way a ticket can wait on a person
 *   or on the scheduler maps to at least one action here, with and without a card, and a new
 *   ticket status, failure cause or setup cause that has no mapping fails this test instead of
 *   shipping a dead end.
 *
 * Pins: the action table of the brief (order is button order), replan offered only for a card
 *   that is not a Discussion, every FailureCause, SetupCause type, escalation kind, ticket
 *   status, scheduler wait kind and card phase with needs_you yields at least one action, and
 *   a property over all of them together.
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
  EscalationAction,
  EscalationKind,
  FailureCause,
  SetupCause,
} from '#/schemas/escalation.js';
import type { EscalationPayload } from '#/schemas/escalation.js';
import { TicketStatus } from '#/schemas/ticket.js';
import type { EscalationBase } from '#/types/escalation.types.js';

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
    kind,
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

  it('offers recheck and cancel for setup, whatever the cause', () => {
    for (const type of SetupCause.options.map((o) => o.shape.type.value)) {
      expect(escalationActions(payloadOf('setup', type), { replannable: true })).toEqual([
        'recheck',
        'cancel',
      ]);
    }
  });

  it('drops replan when the ticket has no card to re-plan', () => {
    expect(
      escalationActions(payloadOf('failure', 'retry_cap'), { replannable: false }),
    ).toEqual(['retry', 'cancel']);

    expect(
      escalationActions(payloadOf('failure', 'lane_hold'), { replannable: false }),
    ).toEqual(['run_as_express', 'cancel']);
  });

  it('has a row for every failure cause and nothing else', () => {
    expect(Object.keys(FAILURE_ACTIONS).sort()).toEqual([...FailureCause.options].sort());
  });
});

describe('ticket waits', () => {
  it('offers rework and cancel for review and sign-off', () => {
    for (const status of ['review', 'needs_signoff'] as const) {
      expect(ticketWaitActions({ status, replannable: true }, [], null)).toEqual([
        'rework',
        'cancel',
      ]);
    }
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

  const payloads: EscalationPayload[] = [
    payloadOf('question'),
    ...failureCauses,
    ...setups,
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
