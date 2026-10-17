/**
 * Pipeline schemas — the ordered stages a ticket of one lane goes through.
 *
 * Why: until now every lane ran one Worker and then the gates. Owners need to say "Standard
 *   writes the failing tests first, then the implementation, then an independent reviewer",
 *   and to see that recorded for every ticket (d-0136, d-0151, d-0152). A pipeline is that
 *   statement as data: a short list of stages (an agent, a script gate, a group that runs
 *   together, a human sign-off) with merge locked last. It lives in the versioned config
 *   rows, so each save is audited and a started ticket keeps the copy it began with. The
 *   shapes are strict so a typo is refused when saved, and the rules that make a list safe
 *   (nobody approves their own work, G1 after the last writer) are checked by
 *   `pipelineProblems` on save and again when a ticket takes its snapshot.
 *
 * Exports: StageId, Severity, CheckPolicy, AgentStage, ScriptGateStage, GroupStage, HumanStage,
 *   MergeStage, Stage, PipelineDefinition, LanePipelines, RoutingRule, ProjectPipelines,
 *   PIPELINE_PROBLEM_CODES, PipelineProblem, PipelineTag, PipelineView (and their types),
 *   MAX_STAGES, MAX_ROUTING_RULES.
 * Depends on: schemas/agent, schemas/ticket, zod. No IO.
 */

import { z } from 'zod';
import { AgentId } from '#/schemas/agent.js';
import { Lane } from '#/schemas/ticket.js';

/** Lowercase slug up to 40 characters; the same shape as a planning-flow step id. */
export const StageId = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);
export type StageId = z.infer<typeof StageId>;

/** How bad a reviewer's finding is; the stage policy names which severities block. */
export const Severity = z.enum(['critical', 'high', 'medium', 'low']);
export type Severity = z.infer<typeof Severity>;

/** A relative folder inside the worktree: no drive, no leading slash, no `..` segment. */
const RelativeDir = z
  .string()
  .min(1)
  .refine(
    (p) => !/^([a-z]:)?[\\/]/i.test(p) && !p.split(/[\\/]/).includes('..'),
    'must be a relative path inside the repository',
  );

const Glob = z.string().min(1).max(300);
const Label = z.string().trim().min(1).max(80);

/**
 * What a check stage does with blocking findings. `rework_to` is the earlier writer the work
 * goes back to (default: the last writer before the stage); `on_blocking` is send back or hold
 * for the owner; `blocking` lists the severities that count. Absent keys take the defaults.
 */
export const CheckPolicy = z.object({
  rework_to: StageId.optional(),
  on_blocking: z.enum(['rework', 'hold']).optional(),
  blocking: z.array(Severity).max(4).optional(),
});
export type CheckPolicy = z.infer<typeof CheckPolicy>;

const policyShape = CheckPolicy.shape;

/** One agent runs: a writer or tester stage writes; a reviewer or researcher stage reads and reports. */
export const AgentStage = z.strictObject({
  id: StageId,
  kind: z.literal('agent'),
  label: Label,
  agent: AgentId,
  /** Tester only: the new tests must fail before the implementation (advisory proof). */
  proof: z.literal('red').optional(),
  ...policyShape,
});
export type AgentStage = z.infer<typeof AgentStage>;

/** The G1 gate (`builtin: 'g1'`) or a command the owner wrote; exit 0 passes. */
export const ScriptGateStage = z.strictObject({
  id: StageId,
  kind: z.literal('script_gate'),
  label: Label,
  run: z.union([
    z.strictObject({ builtin: z.literal('g1') }),
    z.strictObject({
      command: z.string().trim().min(1).max(500),
      cwd: RelativeDir.optional(),
      timeout_ms: z.number().int().min(1_000).max(1_800_000),
      /** A diff touching these paths fails the gate closed; a relative first token of the command is guarded too. */
      guard_paths: z.array(Glob).max(20),
    }),
  ]),
  ...policyShape,
});
export type ScriptGateStage = z.infer<typeof ScriptGateStage>;

/** Two to four checks that run together; the group passes when every member passes. */
export const GroupStage = z.strictObject({
  id: StageId,
  kind: z.literal('group'),
  label: Label,
  join: z.literal('all'),
  members: z.array(z.discriminatedUnion('kind', [AgentStage, ScriptGateStage])).max(8),
  ...policyShape,
});
export type GroupStage = z.infer<typeof GroupStage>;

/** The owner looks at finished work before it merges (the review wait). */
export const HumanStage = z.strictObject({
  id: StageId,
  kind: z.literal('human'),
  label: Label,
  prompt: z.string().trim().min(1).max(500),
});
export type HumanStage = z.infer<typeof HumanStage>;

/** The merge door; always last and never removable. */
export const MergeStage = z.strictObject({
  id: z.literal('merge'),
  kind: z.literal('merge'),
  label: Label,
  locked: z.literal(true),
});
export type MergeStage = z.infer<typeof MergeStage>;

export const Stage = z.discriminatedUnion('kind', [
  AgentStage,
  ScriptGateStage,
  GroupStage,
  HumanStage,
  MergeStage,
]);
export type Stage = z.infer<typeof Stage>;

export const MAX_STAGES = 12;
export const MAX_ROUTING_RULES = 20;

/** One lane's pipeline: 2 to 12 stages and an optional note on what it is for. */
export const PipelineDefinition = z.strictObject({
  stages: z.array(Stage).min(2).max(MAX_STAGES),
  description: z.string().max(500).optional(),
});
export type PipelineDefinition = z.infer<typeof PipelineDefinition>;

/** The pipelines of the three lanes; a company holds all three, a project overrides any. */
export const LanePipelines = z.strictObject({
  express: PipelineDefinition,
  standard: PipelineDefinition,
  full: PipelineDefinition,
});
export type LanePipelines = z.infer<typeof LanePipelines>;

/** When a diff or plan touches `paths`, a check by `add` joins the ticket's pipeline (only ever adds, d-0069). */
export const RoutingRule = z.strictObject({
  id: StageId,
  paths: z.array(Glob).min(1).max(20),
  add: AgentId,
  label: z.string().trim().max(80).optional(),
});
export type RoutingRule = z.infer<typeof RoutingRule>;

/** A project's own pipelines (any lane) and its routing rules. */
export const ProjectPipelines = z.strictObject({
  express: PipelineDefinition.optional(),
  standard: PipelineDefinition.optional(),
  full: PipelineDefinition.optional(),
  routing: z.array(RoutingRule).max(MAX_ROUTING_RULES).default([]),
});
export type ProjectPipelines = z.infer<typeof ProjectPipelines>;

export const PIPELINE_PROBLEM_CODES = [
  'merge_missing',
  'merge_not_last',
  'duplicate_stage_id',
  'too_many_stages',
  'no_writer',
  'g1_missing',
  'g1_duplicate',
  'g1_before_writer',
  'writer_after_check',
  'unknown_agent',
  'agent_unavailable',
  'role_mismatch',
  'reviewer_first',
  'self_review',
  'group_writer',
  'group_size',
  'human_position',
  'rework_target',
  'script_invalid',
  'review_tool_missing',
  'routing_writer',
  'duplicate_rule_id',
] as const;

/** A reason a pipeline or routing list cannot be saved; `stage_id` names the stage (or rule) it concerns. */
export const PipelineProblem = z.object({
  code: z.enum(PIPELINE_PROBLEM_CODES),
  stage_id: StageId.optional(),
  message: z.string().min(1),
});
export type PipelineProblem = z.infer<typeof PipelineProblem>;

/**
 * Where a lane's pipeline comes from: `builtin` equals what the release ships, `edited` differs;
 * in a project view, `project` is the project's own and `company` is inherited.
 */
export const PipelineTag = z.enum(['builtin', 'edited', 'project', 'company']);
export type PipelineTag = z.infer<typeof PipelineTag>;

/** What a settings screen shows for one lane. */
export const PipelineView = z.object({
  lane: Lane,
  definition: PipelineDefinition,
  /** SHA-256 of the definition; a ticket records the hash it started with. */
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  tags: z.array(PipelineTag),
  /** False while the lane has no runner (Full until the next update): tickets of the lane wait. */
  live: z.boolean(),
  warnings: z.array(z.string()),
});
export type PipelineView = z.infer<typeof PipelineView>;
