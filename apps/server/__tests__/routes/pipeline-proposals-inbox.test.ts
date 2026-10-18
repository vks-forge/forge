/**
 * The Inbox item of a pipeline proposal.
 *
 * Why: a proposal of the Director to change a lane belongs to the project and blocks nothing, but the owner must still
 *   find it where they look for what needs them (d-0135, d-0116). It is derived from its row like every Inbox item: one
 *   item while pending, dated by when it was made, and gone once accepted or rejected, so the Inbox can never disagree
 *   with the Pipelines banner.
 *
 * Pins: Done-when 10 (a pending proposal appears once as `pipeline_proposal:<id>`, needs action, dated by its creation;
 *   accepted and rejected ones disappear).
 * Depends on: helpers/agent-rig. IO: a loopback socket and in-memory storage.
 */

import { BUILTIN_PIPELINES, pipelineHash } from '@forge/core';
import type { NewPipelineProposal } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startAgentRig } from '#tests/helpers/agent-rig.js';
import type { AgentRig } from '#tests/helpers/agent-rig.js';

let rig: AgentRig;

const NOW = '2026-10-18T09:00:00.000Z';
const stages = BUILTIN_PIPELINES.standard.stages;
const stage = {
  id: 'dir-critic',
  kind: 'agent' as const,
  label: 'Critique',
  agent: 'critic',
};

const proposal = (key: string): NewPipelineProposal => ({
  project: 'demo',
  lane: 'standard',
  key,
  base_hash: pipelineHash(BUILTIN_PIPELINES.standard),
  op: {
    op: 'add',
    stage,
    after: 'g1',
    reason: 'The change touches the session token check.',
  },
  proposed: { stages: [...stages.slice(0, 3), stage, ...stages.slice(3)] },
  evidence: [
    { ticket_id: 'DM-1' as never, reason: 'The change touches the session token check.' },
  ],
  count: 3,
  created_at: NOW,
});

const seed = (key: string): Promise<number> =>
  rig.storage
    .transaction((tx) => tx.pipelineProposals.insert(proposal(key)))
    .then((id) => id as number);

const call = (method: string, path: string, body?: unknown) =>
  rig.http.json(method, path, body);

const inbox = async () =>
  (
    (await call('GET', '/projects/demo/inbox?view=all')).body as {
      items: {
        id: string;
        kind: string;
        needs_action: boolean;
        updated_at: string;
        title: string;
      }[];
    }
  ).items.filter((i) => i.kind === 'pipeline_proposal');

beforeEach(async () => {
  rig = await startAgentRig();
});

afterEach(async () => {
  await rig.close();
});

describe('the Inbox', () => {
  it('lists a pending proposal once and drops it once rejected or accepted', async () => {
    const id = await seed('standard:add:critic@after:g1');
    const [item, ...rest] = await inbox();

    expect(rest).toEqual([]);
    expect(item).toMatchObject({
      id: `pipeline_proposal:${id}`,
      needs_action: true,
      updated_at: NOW,
    });

    expect(item?.title).toContain('standard');

    await call('POST', `/settings/projects/demo/pipeline-proposals/${id}/reject`, {
      reason: 'not now',
    });

    expect(await inbox()).toEqual([]);

    const second = await seed('standard:other');
    await call('POST', `/settings/projects/demo/pipeline-proposals/${second}/accept`, {
      expected_version: 0,
    });

    expect(await inbox()).toEqual([]);
  });
});
