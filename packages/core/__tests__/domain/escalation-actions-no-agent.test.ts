/**
 * Pins what the owner can do about a stage that ran out of places to run.
 *
 * Why: when an agent and every fallback the owner listed have failed, the ticket waits, and a ticket that waits with
 *   nothing to click on is a dead end the owner cannot leave without editing the database (d-0135). The item offers
 *   Retry (the chain starts over from the agent's own place), Re-plan (only when the ticket has a card) and Cancel.
 *   The engine-only action `substitute` (the Director swapping in another agent) is never a button, for any kind of
 *   escalation, so an owner cannot pick it and a stale web build cannot offer it.
 *
 * Pins: the `no_agent_available` row with and without a card, and that `substitute` is offered by no table.
 * Depends on: src/domain/escalation-actions, src/schemas/escalation, tests/helpers/escalation-payloads, vitest.
 */

import { describe, expect, it } from 'vitest';
import { escalationActions } from '#/domain/escalation-actions.js';
import { DECISION_CAUSES, FailureCause } from '#/schemas/escalation.js';
import type { EscalationPayload } from '#/schemas/escalation.js';
import { Tier } from '#/schemas/ticket.js';
import { decisionPayload, signOffPayload } from '#tests/helpers/escalation-payloads.js';

const failure = (cause: FailureCause): EscalationPayload => ({
  kind: 'failure',
  cause,
  summary: 'it failed',
  attempts: [],
});

describe('no_agent_available', () => {
  it('offers retry, replan and cancel, and drops replan without a card (d-0135)', () => {
    const payload = failure('no_agent_available');

    expect(escalationActions(payload, { replannable: true })).toEqual([
      'retry',
      'replan',
      'cancel',
    ]);

    expect(escalationActions(payload, { replannable: false })).toEqual([
      'retry',
      'cancel',
    ]);
  });

  it('never offers the engine-only substitute as a button', () => {
    const payloads: EscalationPayload[] = [
      { kind: 'question', text: 'Which one?', source: 'ask_director', options: [] },
      ...FailureCause.options.map(failure),
      ...DECISION_CAUSES.map((c) => decisionPayload(c)),
      ...Tier.options.map((t) => signOffPayload(t)),
    ];

    for (const payload of payloads) {
      expect(escalationActions(payload, { replannable: true })).not.toContain(
        'substitute',
      );
    }
  });
});
