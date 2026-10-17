/**
 * Stage-run schemas — what happened at each stage of one ticket's pipeline.
 *
 * Why: a ticket now passes through several stages (write tests, implement, gates, review) and
 *   the owner, the engine and a restarted server must all read the same account of where it
 *   is. A `StageRun` row is one stage attempt (stage, group member, rework cycle), unique per
 *   those three, so a double tick or a restart can never start a stage twice and the cursor
 *   can be computed from the rows alone. A reviewer reports through a typed `ReviewSubmission`
 *   (findings with severity, place and evidence), never prose, and the artifacts stored per
 *   stage (diff, claims, narrative) are what a later stage was shown, kept with a hash so the
 *   owner can see exactly what a reviewer read. The ticket's own copy of its pipeline
 *   (`TicketPipeline`) is what makes a later settings edit unable to change a started ticket.
 *
 * Exports: Finding, ReviewSubmission, StageRunStatus, StageOutcome, StageRun, StageArtifact,
 *   RoutedStage, TicketPipeline, StageViewSchema, TicketPipelineView, STAGE_RUN_STATUSES,
 *   STAGE_RUN_KINDS (and their types).
 * Depends on: schemas/agent, schemas/config-override, schemas/gate-result, schemas/ids,
 *   schemas/pipeline, schemas/ticket, types/stage-view, zod. No IO.
 */

import { z } from 'zod';
import { AgentId, AgentRole, ArtifactKind } from '#/schemas/agent.js';
import { ConfigVersionRef } from '#/schemas/config-override.js';
import { GateStatus } from '#/schemas/gate-result.js';
import { TicketId } from '#/schemas/ids.js';
import { PipelineDefinition, Severity, StageId } from '#/schemas/pipeline.js';
import { Lane } from '#/schemas/ticket.js';
import type { StageView } from '#/types/stage-view.types.js';

const Timestamp = z.iso.datetime();
const RelPath = z.string().min(1).max(500);

/** One thing a reviewer found; evidence is required, a finding without it is refused. */
export const Finding = z.object({
  severity: Severity,
  file: RelPath.optional(),
  line: z.number().int().positive().optional(),
  issue: z.string().min(1).max(1000),
  evidence: z.string().min(1).max(2000),
});
export type Finding = z.infer<typeof Finding>;

/** What `submit_review` carries: a verdict, a short summary and up to 100 findings. */
export const ReviewSubmission = z.object({
  verdict: z.enum(['pass', 'changes']),
  summary: z.string().min(1).max(4000),
  findings: z.array(Finding).max(100),
});
export type ReviewSubmission = z.infer<typeof ReviewSubmission>;

export const STAGE_RUN_STATUSES = [
  'running',
  'passed',
  'failed',
  'error',
  'waiting',
  'skipped',
  'adopted',
] as const;
export const StageRunStatus = z.enum(STAGE_RUN_STATUSES);
export type StageRunStatus = z.infer<typeof StageRunStatus>;

export const STAGE_RUN_KINDS = ['agent', 'script_gate', 'human'] as const;

/** The result of a stage attempt; every key is optional and set only by the stage kind that produces it. */
export const StageOutcome = z.object({
  review: ReviewSubmission.optional(),
  /** How many findings were blocking under the stage policy. */
  blocking: z.number().int().nonnegative().optional(),
  gate: z
    .object({ status: GateStatus, report_ref: z.string().min(1).optional() })
    .optional(),
  /** Red proof: true when the new tests failed before the implementation. */
  red: z.boolean().optional(),
  note: z.string().max(1000).optional(),
});
export type StageOutcome = z.infer<typeof StageOutcome>;

/** One stage attempt; `member_id` is empty outside a group, `cycle` counts reworks from 0. */
export const StageRun = z.object({
  id: z.number().int().positive(),
  ticket_id: TicketId,
  stage_id: StageId,
  member_id: z.string().max(40),
  cycle: z.number().int().nonnegative(),
  kind: z.enum(STAGE_RUN_KINDS),
  agent_id: AgentId.optional(),
  agent_hash: z.string().optional(),
  run_id: z.string().min(1).optional(),
  status: StageRunStatus,
  outcome: StageOutcome,
  started_at: Timestamp,
  ended_at: Timestamp.optional(),
});
export type StageRun = z.infer<typeof StageRun>;

/** What a stage was shown or produced, stored whole (capped) with its hash. */
export const StageArtifact = z.object({
  id: z.number().int().positive(),
  ticket_id: TicketId,
  stage_run_id: z.number().int().positive(),
  kind: ArtifactKind,
  content: z.string().max(200_000),
  truncated: z.boolean(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  created_at: Timestamp,
});
export type StageArtifact = z.infer<typeof StageArtifact>;

/** A stage a routing rule added to this ticket, at plan time or on the real diff. */
export const RoutedStage = z.object({
  rule_id: StageId,
  agent: AgentId,
  stage_id: StageId,
  at: z.enum(['snapshot', 'diff']),
});
export type RoutedStage = z.infer<typeof RoutedStage>;

/**
 * The ticket's own copy of its lane pipeline (routed stages included), taken at its first dispatch.
 * `roles` records each named agent's role at that moment, so the cursor can tell writers from
 * checks without the roster.
 */
export const TicketPipeline = z.object({
  ticket_id: TicketId,
  lane: Lane,
  definition: PipelineDefinition,
  roles: z.record(AgentId, AgentRole),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  config_version: ConfigVersionRef,
  routed: z.array(RoutedStage),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type TicketPipeline = z.infer<typeof TicketPipeline>;

export const StageViewSchema: z.ZodType<StageView> = z.lazy(() =>
  z.object({
    id: z.string(),
    kind: z.enum(['agent', 'script_gate', 'group', 'human', 'merge']),
    label: z.string(),
    agent: z.object({ id: z.string(), name: z.string() }).optional(),
    members: z.array(StageViewSchema).optional(),
    status: z.union([StageRunStatus, z.literal('pending')]),
    cycle: z.number().int().nonnegative(),
    run_id: z.string().optional(),
    started_at: z.string().optional(),
    ended_at: z.string().optional(),
    summary: z.string().optional(),
    counts: z.record(Severity, z.number().int().nonnegative()).optional(),
    artifacts: z.array(z.object({ id: z.number().int().positive(), kind: ArtifactKind })),
  }),
);

/** `GET /tickets/:id/pipeline`: the strip the ticket page draws. */
export const TicketPipelineView = z.object({
  lane: Lane,
  hash: z.string(),
  config_version: ConfigVersionRef,
  stages: z.array(StageViewSchema),
  routed: z.array(RoutedStage),
  rework: z.object({
    count: z.number().int().nonnegative(),
    cap: z.number().int().positive(),
  }),
});
export type TicketPipelineView = z.infer<typeof TicketPipelineView>;
