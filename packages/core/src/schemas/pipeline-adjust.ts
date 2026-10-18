/**
 * Pipeline adjustment schemas — how the Director changes one ticket's own copy of a pipeline.
 *
 * Why: the owner sets each lane's pipeline, but a ticket is sometimes better served by a lighter or
 *   heavier list (a security reviewer on a change to the auth code; a second reviewer swapped in when
 *   the first agent cannot run). The Director may adjust the ticket's copy with a reason for every
 *   change, never the project's list and never a deterministic check, a person's step or an owner
 *   rule (d-0151, d-0149). A change is a small typed op (add, remove, swap, move) so it can be
 *   validated by plain code, shown on the plan the owner approves and on the ticket's strip, and
 *   replayed onto a heavier lane. Every applied or dropped op is kept in an adjustment log with the
 *   stable key that lets the engine notice the same change recurring across tickets.
 *
 * Exports: AdjustReason, PipelineAdjustOp, PlanPipeline, ADJUST_PROBLEM_CODES, AdjustProblem,
 *   PipelineAdjustment, MAX_ADJUSTMENTS, MAX_PLAN_OPS (and their types).
 * Depends on: schemas/agent, schemas/pipeline, zod. No IO.
 */

import { z } from 'zod';
import { AgentId } from '#/schemas/agent.js';
import { AgentStage, GroupStage, PipelineProblem, StageId } from '#/schemas/pipeline.js';

/** Why the Director made a change: plain words, 10 to 500 characters. */
export const AdjustReason = z.string().trim().min(10).max(500);
export type AdjustReason = z.infer<typeof AdjustReason>;

/** The most ops one plan entry may carry, and the most entries one ticket's log keeps. */
export const MAX_PLAN_OPS = 6;
export const MAX_ADJUSTMENTS = 40;

/** One change to a ticket's pipeline copy; `add` ids are `dir-<slug>` so they never collide with the lane's own. */
export const PipelineAdjustOp = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add'),
    stage: z.discriminatedUnion('kind', [AgentStage, GroupStage]),
    after: StageId,
    reason: AdjustReason,
  }),
  z.object({ op: z.literal('remove'), stage_id: StageId, reason: AdjustReason }),
  z.object({
    op: z.literal('swap'),
    stage_id: StageId,
    /** The member of a group to swap; absent for a lone agent stage. */
    member_id: StageId.optional(),
    agent: AgentId,
    reason: AdjustReason,
  }),
  z.object({
    op: z.literal('move'),
    stage_id: StageId,
    after: StageId,
    reason: AdjustReason,
  }),
]);
export type PipelineAdjustOp = z.infer<typeof PipelineAdjustOp>;

/** What a plan entry carries: one to six ops, each with its reason. */
export const PlanPipeline = z.object({
  ops: z.array(PipelineAdjustOp).min(1).max(MAX_PLAN_OPS),
});
export type PlanPipeline = z.infer<typeof PlanPipeline>;

export const ADJUST_PROBLEM_CODES = [
  'locked_stage',
  'adjust_unknown_stage',
  'adjust_unknown_agent',
  'adjust_role_change',
  'adjust_scope_wider',
  'adjust_duplicate_id',
  /** The result fails `pipelineProblems`; the problems ride along. */
  'adjust_rules',
] as const;

/** Why one op cannot be applied. */
export const AdjustProblem = z.object({
  code: z.enum(ADJUST_PROBLEM_CODES),
  stage_id: StageId.optional(),
  message: z.string().min(1),
  problems: z.array(PipelineProblem).optional(),
});
export type AdjustProblem = z.infer<typeof AdjustProblem>;

/** One entry of a ticket's adjustment log. `plan` ops come from the approved plan; `fallback` ones from a substitute. */
export const PipelineAdjustment = z.object({
  seq: z.number().int().nonnegative(),
  op: PipelineAdjustOp,
  by: z.literal('director'),
  cause: z.enum(['plan', 'fallback']),
  key: z.string().min(1).max(120),
  status: z.enum(['applied', 'dropped']),
  problem: z.string().max(500).optional(),
  plan_version: z.number().int().positive().optional(),
  at: z.iso.datetime(),
});
export type PipelineAdjustment = z.infer<typeof PipelineAdjustment>;
