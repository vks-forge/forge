/**
 * Pins the shapes the Director's pipeline changes, proposals and substitute answers must have.
 *
 * Why: these shapes arrive from a model (a plan's ops, a substitute pick) or are stored and read back by
 *   several screens. A reason too short to explain anything, an op with no anchor, a plan that carries seven
 *   ops, a substitute pick with no agent, or a stored plan from before the `pipeline` key existed must each
 *   be handled by the schema, not by whoever reads the value next.
 *
 * Pins: each op with its reason bound, a plan holding one to six ops, an optional `pipeline` on a plan ticket, the
 *   substitute answer's agent, and the optional `on_exhausted`, the new error family, action and Inbox kind.
 * Depends on: src/schemas/{pipeline-adjust,pipeline-proposal,director-steps,plan,agent,errors,escalation,inbox}, vitest.
 */

import { describe, expect, it } from 'vitest';
import { RunsOn } from '#/schemas/agent.js';
import { PickSubstituteOutput } from '#/schemas/director-steps.js';
import { ErrorFamily } from '#/schemas/errors.js';
import { ESCALATION_ACTIONS } from '#/schemas/escalation.js';
import { INBOX_KINDS } from '#/schemas/inbox.js';
import { PipelineAdjustOp, PlanPipeline } from '#/schemas/pipeline-adjust.js';
import { RejectProposalBody } from '#/schemas/pipeline-proposal.js';
import { PlanTicket } from '#/schemas/plan.js';
import { ticket } from '#tests/helpers/plan-fixtures.js';

const WHY = 'The change touches authentication code.';

describe('PipelineAdjustOp', () => {
  it('accepts each op with a reason of at least ten characters', () => {
    expect(
      PipelineAdjustOp.safeParse({ op: 'remove', stage_id: 'reviewer', reason: WHY })
        .success,
    ).toBe(true);

    expect(
      PipelineAdjustOp.safeParse({ op: 'move', stage_id: 'a', after: 'b', reason: WHY })
        .success,
    ).toBe(true);

    expect(
      PipelineAdjustOp.safeParse({
        op: 'swap',
        stage_id: 'a',
        agent: 'critic',
        reason: WHY,
      }).success,
    ).toBe(true);

    expect(
      PipelineAdjustOp.safeParse({
        op: 'add',
        stage: { id: 'dir-x', kind: 'agent', label: 'X', agent: 'critic' },
        after: 'g1',
        reason: WHY,
      }).success,
    ).toBe(true);
  });

  it('refuses a short reason, a missing anchor and an unknown op', () => {
    expect(
      PipelineAdjustOp.safeParse({ op: 'remove', stage_id: 'a', reason: 'short' })
        .success,
    ).toBe(false);

    expect(
      PipelineAdjustOp.safeParse({ op: 'move', stage_id: 'a', reason: WHY }).success,
    ).toBe(false);

    expect(
      PipelineAdjustOp.safeParse({ op: 'rename', stage_id: 'a', reason: WHY }).success,
    ).toBe(false);
  });

  it('a plan pipeline holds one to six ops', () => {
    const op = { op: 'remove', stage_id: 'a', reason: WHY };

    expect(PlanPipeline.safeParse({ ops: [] }).success).toBe(false);
    expect(PlanPipeline.safeParse({ ops: Array(6).fill(op) }).success).toBe(true);
    expect(PlanPipeline.safeParse({ ops: Array(7).fill(op) }).success).toBe(false);
  });
});

describe('PlanTicket.pipeline', () => {
  it('is optional, so every stored plan still parses', () => {
    expect(PlanTicket.safeParse(ticket('t1')).success).toBe(true);
    expect(
      PlanTicket.safeParse({
        ...ticket('t1'),
        pipeline: { ops: [{ op: 'remove', stage_id: 'a', reason: WHY }] },
      }).success,
    ).toBe(true);
  });
});

describe('PickSubstituteOutput', () => {
  it('needs an agent to substitute, not to pause', () => {
    expect(
      PickSubstituteOutput.safeParse({ decision: 'substitute', reason: WHY }).success,
    ).toBe(false);

    expect(
      PickSubstituteOutput.safeParse({
        decision: 'substitute',
        agent: 'critic',
        reason: WHY,
      }).success,
    ).toBe(true);

    expect(
      PickSubstituteOutput.safeParse({ decision: 'pause', reason: WHY }).success,
    ).toBe(true);
  });
});

describe('contract additions', () => {
  it('RunsOn.on_exhausted is optional and takes two values', () => {
    const base = {
      harness: 'project_default',
      model: { kind: 'forge_default' },
      fallbacks: [],
    };

    expect(RunsOn.safeParse(base).success).toBe(true);
    expect(RunsOn.safeParse({ ...base, on_exhausted: 'pause' }).success).toBe(true);
    expect(RunsOn.safeParse({ ...base, on_exhausted: 'ignore' }).success).toBe(false);
    // No default is written: existing agent hashes must not change.
    expect(RunsOn.parse(base)).not.toHaveProperty('on_exhausted');
  });

  it('names the new error family, escalation action and inbox kind', () => {
    expect(ErrorFamily.options).toContain('model_unavailable');
    expect(ESCALATION_ACTIONS).toContain('substitute');
    expect(INBOX_KINDS).toContain('pipeline_proposal');
  });

  it('a rejection needs a reason of three characters or more', () => {
    expect(RejectProposalBody.safeParse({ reason: 'no' }).success).toBe(false);
    expect(RejectProposalBody.safeParse({ reason: 'not now' }).success).toBe(true);
  });
});
