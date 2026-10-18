/**
 * Payload builders for the finished-work escalations.
 *
 * Why: the rule tests for the action tables and the escalation schemas both need a valid decision and
 *   a valid sign-off payload per cause and tier. One copy keeps them agreeing on what a held ticket's
 *   decision and an owner's sign-off carry.
 *
 * Exports: decisionPayload(), signOffPayload().
 * Depends on: src/schemas/escalation. No IO.
 */

import type { DecisionCause, EscalationPayload } from '#/schemas/escalation.js';
import type { Tier } from '#/schemas/ticket.js';

export const decisionPayload = (cause: DecisionCause): EscalationPayload => ({
  kind: 'decision',
  cause,
  summary: 'held',
  stage_id: 'reviewer',
  stage_label: 'Review',
  findings: [],
  rework: { count: 2, cap: 2 },
});

export const signOffPayload = (tier: Tier): EscalationPayload => ({
  kind: 'sign_off',
  cause: 'tier_b',
  tier,
  summary: 'done',
  checks: {
    passed: 3,
    counts: { critical: 0, high: 0, medium: 0, low: 0 },
    overrides: 0,
  },
});
