/**
 * Rejecting the Director's pipeline proposals.
 *
 * Why: a rejection says "not for this project" and must stick: it needs a reason, it decides the proposal for good
 *   (a second decision is refused), and because the row stays, the same change on the same base list is never proposed
 *   again. It never touches the project's settings, and a proposal of another project or an unknown one is not found.
 *
 * Pins: 400 invalid_request for a reason under three characters, 200 with the decided proposal, 409 not_pending for
 *   a second decision, the key staying taken in storage, no config written, 404 project_not_found and proposal_not_found.
 * Depends on: helpers/agent-rig, helpers/proposal-fixtures. IO: a loopback socket and in-memory storage.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startAgentRig } from '#tests/helpers/agent-rig.js';
import type { AgentRig } from '#tests/helpers/agent-rig.js';
import { proposal, seedProposal } from '#tests/helpers/proposal-fixtures.js';

let rig: AgentRig;

const base = '/settings/projects/demo';
const seed = () => seedProposal(rig);
const call = (method: string, path: string, body?: unknown) =>
  rig.http.json(method, path, body);

const errorOf = (r: { body: unknown }) => (r.body as { error: { code: string } }).error;
const proposalOf = (id: number) =>
  rig.storage.transaction((tx) => tx.pipelineProposals.get(id));

const history = () => rig.config.history('project', 'demo');

beforeEach(async () => {
  rig = await startAgentRig();
});

afterEach(async () => {
  await rig.close();
});

describe('POST reject', () => {
  it('needs a reason of three characters, then rejects for good', async () => {
    const id = await seed();
    const short = await call('POST', `${base}/pipeline-proposals/${id}/reject`, {
      reason: 'no',
    });

    expect([short.status, errorOf(short).code]).toEqual([400, 'invalid_request']);
    expect((await proposalOf(id))?.status).toBe('pending');

    const res = await call('POST', `${base}/pipeline-proposals/${id}/reject`, {
      reason: 'not for this project',
    });

    expect(res.status).toBe(200);
    expect((res.body as { proposal: unknown }).proposal).toMatchObject({
      status: 'rejected',
      decided_reason: 'not for this project',
    });

    const again = await call('POST', `${base}/pipeline-proposals/${id}/reject`, {
      reason: 'still no',
    });

    expect([again.status, errorOf(again).code]).toEqual([409, 'not_pending']);
    // The same change on the same base is never proposed again: the key stays taken.
    expect(
      await rig.storage.transaction((tx) => tx.pipelineProposals.insert(proposal())),
    ).toBe('exists');

    expect(await history()).toHaveLength(0);
  });

  it('answers 404 for an unknown project and an unknown proposal', async () => {
    const ghost = await call(
      'POST',
      '/settings/projects/ghost/pipeline-proposals/1/reject',
      { reason: 'no way' },
    );

    const none = await call('POST', `${base}/pipeline-proposals/42/reject`, {
      reason: 'no way',
    });

    expect([ghost.status, errorOf(ghost).code]).toEqual([404, 'project_not_found']);
    expect([none.status, errorOf(none).code]).toEqual([404, 'proposal_not_found']);
  });
});
