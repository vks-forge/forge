/**
 * Pins the action tables for a held ticket's decision and for the owner's sign-off.
 *
 * Why: a held ticket and finished work waiting for a name are waits like any other, and a wait with no
 *   button is a dead end (d-0135). A hold on findings the owner may overrule offers Merge anyway first,
 *   then Send back, Re-plan and Cancel (never Merge anyway on a failed gate); work that outgrew its plan
 *   offers Continue, Re-plan, Cancel; tier C offers a named sign-off and tier A and B an approval;
 *   and a ticket page for finished work offers the pending sign-off item's actions.
 *
 * Pins: DECISION_ACTIONS per cause with and without a card to re-plan through; SIGN_OFF_ACTIONS per tier;
 *   ticketWaitActions for a review ticket with and without a pending sign-off item.
 * Depends on: src/domain/escalation-actions, vitest.
 */

import { describe, expect, it } from 'vitest';
import { escalationActions, ticketWaitActions } from '#/domain/escalation-actions.js';
import type { EscalationPayload } from '#/schemas/escalation.js';
import type { EscalationBase } from '#/types/escalation.types.js';
import { decisionPayload, signOffPayload } from '#tests/helpers/escalation-payloads.js';

const AT = '2026-10-17T00:00:00.000Z';

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

describe('decision and sign-off tables', () => {
  it('offers merge anyway first for held findings, never for scope drift', () => {
    expect(
      escalationActions(decisionPayload('findings_hold'), { replannable: true }),
    ).toEqual(['merge_anyway', 'rework', 'replan', 'cancel']);

    expect(
      escalationActions(decisionPayload('scope_drift'), { replannable: true }),
    ).toEqual(['continue', 'replan', 'cancel']);
  });

  it('drops replan when the ticket has no card to go back to', () => {
    expect(
      escalationActions(decisionPayload('findings_hold'), { replannable: false }),
    ).toEqual(['merge_anyway', 'rework', 'cancel']);
  });

  it('offers a named sign-off for tier C and an approval for tier A and B', () => {
    expect(escalationActions(signOffPayload('C'), { replannable: true })).toEqual([
      'sign_off',
      'rework',
      'cancel',
    ]);

    for (const tier of ['A', 'B'] as const) {
      expect(escalationActions(signOffPayload(tier), { replannable: true })).toEqual([
        'approve',
        'rework',
        'cancel',
      ]);
    }
  });

  it('offers a review ticket the pending sign-off item actions, else the status tables', () => {
    const item = pendingView(signOffPayload('C'));

    expect(
      ticketWaitActions({ status: 'review', replannable: true }, [item], null),
    ).toEqual(['sign_off', 'rework', 'cancel']);

    expect(ticketWaitActions({ status: 'review', replannable: true }, [], null)).toEqual([
      'approve',
      'rework',
      'cancel',
    ]);
  });
});
