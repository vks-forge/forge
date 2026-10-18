/**
 * Fixtures for the pipeline proposal route tests: a pending proposal of project `demo` and how to seed it.
 *
 * Why: the accept, reject and Inbox tests all start from the same proposal (a critic added after G1 on Standard, made
 *   against the shipped Standard list), and a test that wants another base, key or project changes only that field.
 *
 * Exports: NOW, BASE_HASH, stages, addCritic, proposed, proposal(), seedProposal().
 * Depends on: @forge/core, helpers/agent-rig. No IO.
 */

import { BUILTIN_PIPELINES, pipelineHash } from '@forge/core';
import type { NewPipelineProposal } from '@forge/core';
import type { AgentRig } from '#tests/helpers/agent-rig.js';

export const NOW = '2026-10-18T09:00:00.000Z';
export const BASE_HASH = pipelineHash(BUILTIN_PIPELINES.standard);
export const stages = BUILTIN_PIPELINES.standard.stages;

export const addCritic = {
  op: 'add' as const,
  stage: { id: 'dir-critic', kind: 'agent' as const, label: 'Critique', agent: 'critic' },
  after: 'g1',
  reason: 'The change touches the session token check.',
};

export const proposed = {
  stages: [...stages.slice(0, 3), addCritic.stage, ...stages.slice(3)],
};

export const proposal = (
  over: Partial<NewPipelineProposal> = {},
): NewPipelineProposal => ({
  project: 'demo',
  lane: 'standard',
  key: 'standard:add:critic@after:g1',
  base_hash: BASE_HASH,
  op: addCritic,
  proposed,
  evidence: [{ ticket_id: 'DM-1' as never, reason: addCritic.reason }],
  count: 3,
  created_at: NOW,
  ...over,
});

/** Inserts a pending proposal of project `demo` (the fixture's default) and answers its id. */
export const seedProposal = (
  rig: AgentRig,
  over: Partial<NewPipelineProposal> = {},
): Promise<number> =>
  rig.storage
    .transaction((tx) => tx.pipelineProposals.insert(proposal(over)))
    .then((id) => id as number);
