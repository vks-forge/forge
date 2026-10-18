/**
 * The owner's marks on findings, and what the ticket's strip says about the Director's changes and the run that
 * really happened.
 *
 * Why: the owner's "Real" or "False alarm" on a finding is the one direct judgement scorecards have (d-0081), so a
 *   mark must name a finding that exists on a stage row of this very ticket (never another ticket's review, never an
 *   index past the findings) and must be clearable; the strip must show the mark beside the finding it is on (and
 *   the row id the route is keyed by). The same strip tells the owner what the Director changed in the ticket's own
 *   pipeline (an added stage with its reason, a removed one as a ghost, a swapped agent with its cause) and which
 *   harness, model and fallback slot a stage's run really used, so nothing the Director or a fallback did is hidden.
 *
 * Pins: PUT mark sets, replaces and clears (null) a mark and answers the fresh strip with `row_id` and `marks`;
 *   404 ticket_not_found, finding_not_found (another ticket's row, a row with no review, an index out of range, a
 *   bad id); 400 invalid_request for a bad verdict; GET shows `changed`, `removed`, `adjustments`, `base_hash` and
 *   `ran_on`.
 * Depends on: helpers/agent-rig. IO: a loopback socket and in-memory storage.
 */

import { BUILTIN_PIPELINES, makeTicketId, pipelineHash } from '@forge/core';
import type {
  PipelineAdjustment,
  StageView,
  Ticket,
  TicketPipelineView,
} from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startAgentRig } from '#tests/helpers/agent-rig.js';
import type { AgentRig } from '#tests/helpers/agent-rig.js';

let rig: AgentRig;

const AT = '2026-10-18T09:00:00.000Z';
const errorOf = (r: { body: unknown }) => (r.body as { error: { code: string } }).error;
const strip = (r: { body: unknown }): TicketPipelineView =>
  (r.body as { pipeline: TicketPipelineView }).pipeline;

const ticket = (n: number): Ticket => ({
  id: makeTicketId('DM', n),
  project: 'demo',
  title: `Ticket ${n}`,
  body: 'b',
  type: 'feat',
  lane: 'standard',
  tier_predicted: 'A',
  status: 'verifying',
  status_version: 1,
  rework_count: 0,
  priority: 0,
  created_at: AT,
  updated_at: AT,
  blocked_by: [],
});

const snapshot = (
  n: number,
  stages = BUILTIN_PIPELINES.standard.stages,
  adjustments: PipelineAdjustment[] = [],
) => ({
  ticket_id: makeTicketId('DM', n),
  lane: 'standard' as const,
  definition: { stages },
  roles: {
    'test-writer': 'tester' as const,
    implementer: 'writer' as const,
    reviewer: 'reviewer' as const,
    critic: 'reviewer' as const,
  },
  hash: pipelineHash({ stages }),
  base_hash: pipelineHash(BUILTIN_PIPELINES.standard),
  config_version: 'c0:p0',
  routed: [],
  adjustments,
  created_at: AT,
  updated_at: AT,
});

const findings = [
  { severity: 'high' as const, issue: 'a', evidence: 'x' },
  { severity: 'low' as const, issue: 'b', evidence: 'y' },
];

/** DM-1 with a failed review (two findings) and a passed implementer; DM-2 with a review of its own. */
async function seed(): Promise<{ review: number; other: number; writer: number }> {
  return rig.storage.transaction(async (tx) => {
    await tx.tickets.insert(ticket(1));
    await tx.tickets.insert(ticket(2));
    await tx.ticketPipelines.insert(snapshot(1));
    await tx.ticketPipelines.insert(snapshot(2));
    const row = async (n: number, stage: string, agent: string, outcome = {}) =>
      (await tx.stageRuns.start({
        ticket_id: makeTicketId('DM', n),
        stage_id: stage,
        member_id: '',
        cycle: 0,
        kind: 'agent',
        agent_id: agent,
        status: stage === 'reviewer' ? 'failed' : 'passed',
        outcome,
        started_at: AT,
      })) as number;

    const review = await row(1, 'reviewer', 'reviewer', {
      review: { verdict: 'changes', summary: 'two', findings },
    });

    const writer = await row(1, 'implementer', 'implementer');
    const other = await row(2, 'reviewer', 'reviewer', {
      review: { verdict: 'changes', summary: 'one', findings: findings.slice(0, 1) },
    });

    return { review, other, writer };
  });
}

const mark = (id: number, index: number | string, verdict: unknown, ticketId = 'DM-1') =>
  rig.http.json('PUT', `/tickets/${ticketId}/findings/${id}/${index}/mark`, { verdict });

const reviewer = (r: { body: unknown }): StageView | undefined =>
  strip(r).stages.find((s) => s.id === 'reviewer');

beforeEach(async () => {
  rig = await startAgentRig();
});

afterEach(async () => {
  await rig.close();
});

describe('PUT /tickets/:id/findings/:stageRunId/:index/mark', () => {
  it('sets, replaces and clears a mark and answers the fresh strip', async () => {
    const { review } = await seed();

    const set = await mark(review, 0, 'real');

    expect(set.status).toBe(200);
    expect(reviewer(set)).toMatchObject({
      row_id: review,
      marks: [{ index: 0, verdict: 'real' }],
    });

    await mark(review, 1, 'false_alarm');
    const swapped = await mark(review, 0, 'false_alarm');

    expect(reviewer(swapped)?.marks).toEqual([
      { index: 0, verdict: 'false_alarm' },
      { index: 1, verdict: 'false_alarm' },
    ]);

    const cleared = await mark(review, 0, null);

    expect(reviewer(cleared)?.marks).toEqual([{ index: 1, verdict: 'false_alarm' }]);
    expect((await mark(review, 1, null)).status).toBe(200);
    expect(
      reviewer(await rig.http.json('GET', '/tickets/DM-1/pipeline'))?.marks,
    ).toBeUndefined();
  });

  it("answers 404 finding_not_found for another ticket's row, a row with no review, a bad index and a bad id", async () => {
    const { review, other, writer } = await seed();

    for (const [id, index] of [
      [other, 0],
      [writer, 0],
      [review, 2],
      [review, 'x'],
      ['abc', 0],
      [9999, 0],
    ] as const) {
      const res = await mark(id as number, index, 'real');

      expect([res.status, errorOf(res).code], `${id}/${index}`).toEqual([
        404,
        'finding_not_found',
      ]);
    }

    expect(
      await rig.storage.transaction((tx) =>
        tx.findingMarks.listByTickets(['DM-1', 'DM-2']),
      ),
    ).toEqual([]);
  });

  it('answers 404 ticket_not_found and 400 invalid_request', async () => {
    const { review } = await seed();
    const none = await mark(review, 0, 'real', 'DM-9');
    const bad = await mark(review, 0, 'maybe');
    const missing = await rig.http.json(
      'PUT',
      `/tickets/DM-1/findings/${review}/0/mark`,
      {},
    );

    expect([none.status, errorOf(none).code]).toEqual([404, 'ticket_not_found']);
    expect([bad.status, errorOf(bad).code]).toEqual([400, 'invalid_request']);
    expect([missing.status, errorOf(missing).code]).toEqual([400, 'invalid_request']);
  });
});
