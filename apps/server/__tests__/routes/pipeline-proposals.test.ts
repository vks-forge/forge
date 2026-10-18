/**
 * The Director's pipeline proposals: list, accept, reject.
 *
 * Why: when the Director keeps making the same change to ticket pipelines it records a proposal instead of editing
 *   the project's lane (d-0151, d-0019), and the owner alone decides it. Accepting must be an ordinary lane save by
 *   the owner (the one config door: rules, version, one append with the reason), so the project's lane then equals
 *   the proposed list and its version moves; a proposal made against a list the owner has since changed is stale and
 *   must write nothing; a rejection needs a reason and sticks for that base; a proposal belongs to its own project,
 *   and a roster that changed since refuses the save instead of storing a broken list.
 *
 * Pins: Done-when 6 (accept: lane equals proposed, project version bumped, author owner, reason "Accepted Director
 *   proposal #n"; accept after an owner edit: 409 proposal_stale, status stale, nothing written; reject: reason
 *   needed, never proposed again) and the listed errors (404 project_not_found, proposal_not_found; 409 not_pending,
 *   version_conflict; 400 invalid_request, pipeline_invalid). The Inbox side is in pipeline-proposals-inbox.test.ts.
 * Depends on: helpers/agent-rig, helpers/pipeline-fixtures. IO: a loopback socket and in-memory storage.
 */

import type { NewPipelineProposal, PipelineProposalView } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentBody, startAgentRig } from '#tests/helpers/agent-rig.js';
import type { AgentRig } from '#tests/helpers/agent-rig.js';
import { STANDARD_LIKE, send } from '#tests/helpers/pipeline-fixtures.js';
import {
  NOW,
  addCritic,
  proposed,
  seedProposal,
  stages,
} from '#tests/helpers/proposal-fixtures.js';

let rig: AgentRig;

const base = '/settings/projects/demo';
const seed = (over: Partial<NewPipelineProposal> = {}) => seedProposal(rig, over);
const call = (method: string, path: string, body?: unknown) =>
  rig.http.json(method, path, body);

const errorOf = (r: { body: unknown }) =>
  (r.body as { error: { code: string; problems?: { code: string }[] } }).error;

const proposalOf = (id: number) =>
  rig.storage.transaction((tx) => tx.pipelineProposals.get(id));

const history = () => rig.config.history('project', 'demo');

beforeEach(async () => {
  rig = await startAgentRig();
});

afterEach(async () => {
  await rig.close();
});

describe('GET /settings/projects/:slug/pipeline-proposals', () => {
  it('lists pending proposals with the lane as it is now, and narrows by status', async () => {
    const first = await seed();
    const second = await seed({
      key: 'standard:remove:reviewer',
      op: { op: 'remove', stage_id: 'reviewer', reason: 'A typo needs no review.' },
    });

    await rig.storage.transaction((tx) =>
      tx.pipelineProposals.decide(second, {
        status: 'rejected',
        reason: 'not now',
        at: NOW,
      }),
    );

    const pending = await call('GET', `${base}/pipeline-proposals`);
    const all = await call('GET', `${base}/pipeline-proposals?status=all`);
    const list = (r: { body: unknown }) =>
      (r.body as { proposals: PipelineProposalView[] }).proposals;

    expect(pending.status).toBe(200);
    expect(list(pending).map((p) => p.id)).toEqual([first]);
    expect(list(pending)[0]).toMatchObject({
      status: 'pending',
      stale: false,
      lane: 'standard',
      count: 3,
    });

    expect(list(pending)[0]?.current.stages.map((s) => s.id)).toEqual(
      stages.map((s) => s.id),
    );

    expect(list(pending)[0]?.proposed.stages.map((s) => s.id)).toContain('dir-critic');
    expect(list(all).map((p) => p.id)).toEqual([second, first]);
  });

  it('reads a proposal as stale once the owner changed the lane', async () => {
    await seed();
    await call('PUT', `${base}/pipelines/standard`, send(0, { pipeline: STANDARD_LIKE }));

    const res = await call('GET', `${base}/pipeline-proposals`);

    expect(
      (res.body as { proposals: PipelineProposalView[] }).proposals[0],
    ).toMatchObject({
      status: 'pending',
      stale: true,
    });
  });

  it('answers 404 project_not_found and 400 invalid_request', async () => {
    const ghost = await call('GET', '/settings/projects/ghost/pipeline-proposals');
    const bad = await call('GET', `${base}/pipeline-proposals?status=everything`);

    expect([ghost.status, errorOf(ghost).code]).toEqual([404, 'project_not_found']);
    expect([bad.status, errorOf(bad).code]).toEqual([400, 'invalid_request']);
  });
});

describe('POST accept', () => {
  it('saves the proposed list through the owner door: lane equals proposed, version bumped, reason recorded', async () => {
    const id = await seed();

    const res = await call('POST', `${base}/pipeline-proposals/${id}/accept`, {
      expected_version: 0,
      reason: 'Good idea',
    });

    const body = res.body as {
      proposal: { status: string; config_version?: string; decided_reason?: string };
      pipelines: {
        version: { project: number };
        pipelines: Record<
          string,
          { definition: { stages: { id: string }[] }; changed: boolean }
        >;
      };
    };

    expect(res.status).toBe(200);
    expect(body.proposal).toMatchObject({
      status: 'accepted',
      config_version: 'c0:p1',
      decided_reason: 'Good idea',
    });

    expect(body.pipelines.version.project).toBe(1);
    expect(body.pipelines.pipelines['standard']?.changed).toBe(true);
    expect(
      body.pipelines.pipelines['standard']?.definition.stages.map((s) => s.id),
    ).toEqual(proposed.stages.map((s) => s.id));

    const [saved] = await history();

    expect(saved).toMatchObject({ author: 'owner', version: 1 });
    expect(saved?.reason).toBe(`Accepted Director proposal #${id}: Good idea`);
    expect((await proposalOf(id))?.status).toBe('accepted');

    const again = await call('POST', `${base}/pipeline-proposals/${id}/accept`, {
      expected_version: 1,
    });

    expect([again.status, errorOf(again).code]).toEqual([409, 'not_pending']);
  });

  it('writes nothing and marks the proposal stale when the owner changed the lane since', async () => {
    const id = await seed();
    await call('PUT', `${base}/pipelines/standard`, send(0, { pipeline: STANDARD_LIKE }));
    expect(await history()).toHaveLength(1);

    const res = await call('POST', `${base}/pipeline-proposals/${id}/accept`, {
      expected_version: 1,
    });

    expect([res.status, errorOf(res).code]).toEqual([409, 'proposal_stale']);
    expect(await history()).toHaveLength(1);
    expect(await proposalOf(id)).toMatchObject({ status: 'stale' });

    const view = await call('GET', `${base}/pipeline-proposals?status=all`);

    expect((view.body as { proposals: PipelineProposalView[] }).proposals[0]?.stale).toBe(
      true,
    );
  });

  it('answers 409 version_conflict for an editor that read an older version, leaving it pending', async () => {
    const id = await seed();
    const res = await call('POST', `${base}/pipeline-proposals/${id}/accept`, {
      expected_version: 7,
    });

    expect([res.status, errorOf(res).code]).toEqual([409, 'version_conflict']);
    expect((await proposalOf(id))?.status).toBe('pending');
    expect(await history()).toHaveLength(0);
  });

  it('answers 400 pipeline_invalid when the roster changed since and stores nothing', async () => {
    const created = await call('POST', '/settings/agents', {
      agent: agentBody({
        name: 'Net reviewer',
        role: 'reviewer',
        tools: ['read', 'mcp__forge__submit_review'],
        write_scope: [],
      }),
      origin: 'custom',
      expected_version: 0,
      reason: 'a network reviewer',
    });

    const agent = (created.body as { id: string }).id;
    const stage = {
      id: 'dir-net',
      kind: 'agent' as const,
      label: 'Network review',
      agent,
    };

    const id = await seed({
      key: `standard:add:${agent}@after:g1`,
      op: { ...addCritic, stage },
      proposed: { stages: [...stages.slice(0, 3), stage, ...stages.slice(3)] },
    });

    // The owner switches the agent off in this project after the Director proposed using it.
    const off = await call(
      'POST',
      '/settings/projects/demo/agents/' + agent + '/disable',
      {
        expected_version: 0,
        reason: 'switched off here',
      },
    );

    expect(off.status).toBe(200);
    const res = await call('POST', `${base}/pipeline-proposals/${id}/accept`, {
      expected_version: 1,
    });

    expect([res.status, errorOf(res).code]).toEqual([400, 'pipeline_invalid']);
    expect(errorOf(res).problems?.map((p) => p.code)).toContain('agent_unavailable');
    expect((await proposalOf(id))?.status).toBe('pending');
    expect(await history()).toHaveLength(1);
  });

  it('answers 404 proposal_not_found for an unknown id, a bad id and another project', async () => {
    const other = await seed({ project: 'other', key: 'standard:other' });
    await rig.storage.transaction((tx) =>
      tx.projects.upsert({
        id: 'other',
        slug: 'other',
        prefix: 'OT',
        status: 'ready',
        ecosystems: [],
        harness_defaults: {},
        tier_c_globs: [],
      }),
    );

    for (const id of ['99', 'abc', String(other)]) {
      const res = await call('POST', `${base}/pipeline-proposals/${id}/accept`, {
        expected_version: 0,
      });

      expect([res.status, errorOf(res).code], id).toEqual([404, 'proposal_not_found']);
    }
  });
});
