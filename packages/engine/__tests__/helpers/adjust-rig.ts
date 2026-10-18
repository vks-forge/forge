/**
 * Rig helpers for the Director's pipeline-adjustment scenarios: a security reviewer, a one-ticket Standard plan with ops,
 * and the moves to plan it and read the ticket's pipeline copy.
 *
 * Why: the scenarios about plan ops (applied at dispatch, vetted when the plan is written, re-applied on a lane raise)
 *   all start the same way: a project that has a security reviewer, a card whose plan carries pipeline ops, planned until
 *   the Director decides. Building that once keeps each scenario a short story of what differs: the op, the owner's edit
 *   in between, the lane raise.
 *
 * Exports: WHY, securityReviewer(), addSecurity, setProject(), withSecurity, planWith(), snapshotOf(), planned().
 * Depends on: helpers/planning-rig, @forge/core. No IO.
 */

import { BUILTIN_AGENTS } from '@forge/core';
import type { AgentDefinition, CardId } from '@forge/core';
import {
  oneTicketPlan,
  planUntilDecision,
  scriptTodo,
} from '#tests/helpers/planning-rig.js';
import type { Rig } from '#tests/helpers/rig.js';

export const WHY = 'The change touches the session token check.';

export const securityReviewer = (): AgentDefinition => ({
  ...(BUILTIN_AGENTS['reviewer'] as AgentDefinition),
  name: 'Security reviewer',
  origin: 'custom',
});

export const addSecurity = {
  op: 'add',
  stage: {
    id: 'dir-security',
    kind: 'agent',
    label: 'Security review',
    agent: 'security-reviewer',
  },
  after: 'g1',
  reason: WHY,
};

/** Saves the project's settings whole (agents and pipelines go in one save). */
export async function setProject(rig: Rig, doc: Record<string, unknown>): Promise<void> {
  const current = await rig.config.project('forge');
  await rig.config.append({
    scope: 'project',
    project: 'forge',
    doc: { default_harness: 'scripted', ...doc },
    author: 'test',
    reason: 'adjust scenario',
    expectedVersion: current.version.project,
  });
}

export const withSecurity = {
  agents: { custom: { 'security-reviewer': securityReviewer() } },
};

/** A one-ticket Standard plan on `files`, carrying `ops`. */
export function planWith(
  ops: unknown[],
  files = ['src/auth-check.ts'],
): Record<string, unknown> {
  const plan = oneTicketPlan(files);
  const [t] = plan['tickets'] as Record<string, unknown>[];
  t!['lane'] = 'standard';
  if (ops.length > 0) {
    t!['pipeline'] = { ops };
  }

  return plan;
}

export const snapshotOf = (rig: Rig, id: string) =>
  rig.storage.transaction((tx) => tx.ticketPipelines.get(id));

export async function planned(rig: Rig, plan: Record<string, unknown>): Promise<CardId> {
  scriptTodo(rig, { write_plan: [plan] });

  return planUntilDecision(rig);
}
