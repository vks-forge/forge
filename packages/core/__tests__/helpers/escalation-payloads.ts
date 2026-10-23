/**
 * Payload builders for the finished-work escalations.
 *
 * Why: the rule tests for the action tables and the escalation schemas both need a valid decision and
 *   a valid sign-off payload per cause and tier. One copy keeps them agreeing on what a held ticket's
 *   decision and an owner's sign-off carry.
 *
 * Exports: decisionPayload(), signOffPayload(), permissionPayload(), worktreeSetupCause.
 * Depends on: src/schemas/escalation. No IO.
 */

import type { DecisionCause, EscalationPayload } from '#/schemas/escalation.js';
import type { SetupCause } from '#/schemas/escalation-setup.js';
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

/** A tool approval waiting on the owner; `always` toggles whether "Always for this project" is offered. */
export const permissionPayload = (always: boolean): EscalationPayload => ({
  kind: 'permission',
  tool: 'shell',
  action: 'shell',
  what: 'cargo add serde',
  approval_key: 'k'.repeat(64),
  reason_code: 'rule_ask',
  why: 'The task needs serde for JSON.',
  lane: 'standard',
  always: always
    ? { offered: true, rule: { action: 'shell', resource: 'cargo add serde' } }
    : { offered: false, why: 'A chain of commands is approved each time.' },
  summary: 'Installing a dependency needs approval in the Standard lane.',
});

/** A worktree setup step that failed on the project's own files. */
export const worktreeSetupCause: SetupCause = {
  type: 'worktree_setup',
  step: 'Install packages',
  command: 'pnpm install --frozen-lockfile',
  exit_code: 1,
  timed_out: false,
  tail: 'ERR_PNPM_NO_LOCKFILE',
  settings_version: 3,
};
