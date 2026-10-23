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
 * Exports: ReviewSubmission, StageRunStatus, StageOutcome, MAX_VIEW_FINDINGS, StageRun, StageArtifact,
 *   RoutedStage, TicketPipeline, StageViewSchema, TicketPipelineView, STAGE_RUN_STATUSES,
 *   STAGE_RUN_KINDS (and their types).
 * Depends on: schemas/agent, schemas/config-override, schemas/finding, schemas/gate-result, schemas/ids,
 *   schemas/pipeline, schemas/pipeline-adjust, schemas/ticket, schemas/ticket-check, types/stage-view, zod. No IO.
 */

import { z } from 'zod';
import { AgentId, AgentRole, ArtifactKind } from '#/schemas/agent.js';
import { ConfigVersionRef } from '#/schemas/config-override.js';
import { Finding } from '#/schemas/finding.js';
import { GateStatus } from '#/schemas/gate-result.js';
import { TicketId } from '#/schemas/ids.js';
import { PipelineDefinition, Severity, StageId } from '#/schemas/pipeline.js';
import { MAX_ADJUSTMENTS, PipelineAdjustment } from '#/schemas/pipeline-adjust.js';
import { TicketCheckOutput } from '#/schemas/ticket-check.js';
import { Lane } from '#/schemas/ticket.js';
import type { StageView } from '#/types/stage-view.types.js';

const Timestamp = z.iso.datetime();

/** What `submit_review` carries: a verdict, a short summary and up to 100 findings. */
export const ReviewSubmission = z.object({
  verdict: z.enum(['pass', 'changes']),
  summary: z.string().min(1).max(4000),
  findings: z.array(Finding).max(100),
});
export type ReviewSubmission = z.infer<typeof ReviewSubmission>;

/** The most findings one stage view carries; the full list stays in the stored outcome. */
export const MAX_VIEW_FINDINGS = 20;

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

export const STAGE_RUN_KINDS = ['agent', 'script_gate', 'human', 'director'] as const;

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
  /** Director check: what the step answered (acceptance verdicts, findings, confidence). */
  check: TicketCheckOutput.optional(),
  /** Director check: changed files the plan's `files` did not cover (computed by the engine, never by the model). */
  unplanned: z.array(z.string().max(500)).max(200).optional(),
  /** Sign-off: who signed the finished work. */
  signed_by: z.enum(['director', 'owner']).optional(),
  /** Sign-off: why the Director signed, or why it declined and left the signature to the owner. */
  sign_reason: z.string().max(500).optional(),
  /** Sign-off: the tier the Director signed; the merge door lets only a row saying `C` carry tier C (d-0181). */
  signed_tier: z.enum(['A', 'B', 'C']).optional(),
  /** The owner overruled a held stage (`merge_anyway` on findings, `continue` on scope drift); the row then reads passed. */
  override: z
    .object({
      by: z.literal('owner'),
      action: z.enum(['merge_anyway', 'continue']),
      comment: z.string().min(1).max(2000),
      at: Timestamp,
    })
    .optional(),
  /** The critic ran on the same model family as the Worker (d-0073): the strip labels it. */
  same_family: z.literal(true).optional(),
  /** Director check: how many times the step failed to answer in this cycle, for the retry bound. */
  attempts: z.number().int().positive().max(20).optional(),
  /**
   * Which entry of the agent's `[primary, ...fallbacks]` chain this attempt runs on (0 = primary), and
   * the entries already tried in it, so the next failure moves on instead of repeating one (d-0080).
   */
  fallback: z
    .object({
      slot: z.number().int().min(-1).max(5),
      tried: z
        .array(
          z.object({
            slot: z.number().int().min(0).max(5),
            harness: z.string().min(1),
            model: z.string().optional(),
            family: z.string().min(1),
          }),
        )
        .max(8),
    })
    .optional(),
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
  /** Hash of the lane list plus routing as it was before any Director change; equal to `hash` when none applied. */
  base_hash: z.string().regex(/^[0-9a-f]{64}$/),
  config_version: ConfigVersionRef,
  routed: z.array(RoutedStage),
  /** Every change the Director made or tried to make to this copy, applied or dropped, in order. */
  adjustments: z.array(PipelineAdjustment).max(MAX_ADJUSTMENTS),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type TicketPipeline = z.infer<typeof TicketPipeline>;

export const StageViewSchema: z.ZodType<StageView> = z.lazy(() =>
  z.object({
    id: z.string(),
    kind: z.enum([
      'agent',
      'script_gate',
      'group',
      'human',
      'director_check',
      'sign_off',
      'merge',
    ]),
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
    /** The current round's findings (capped at 20), so the strip can show file:line and evidence. */
    findings: z.array(Finding).max(MAX_VIEW_FINDINGS).optional(),
    warnings: z.array(z.string()),
    signed_by: z.enum(['director', 'owner']).optional(),
    override: z
      .object({
        by: z.literal('owner'),
        action: z.enum(['merge_anyway', 'continue']),
        comment: z.string(),
        at: z.string(),
      })
      .optional(),
    /** A writer-group member: the write scope it is held to. */
    scope: z.array(z.string()).optional(),
    /** Director check: the acceptance verdicts and the files the plan did not cover. */
    check: TicketCheckOutput.optional(),
    unplanned: z.array(z.string()).optional(),
    /** The Director changed this stage (added, swapped or moved it) and why. */
    changed: z
      .object({
        by: z.literal('director'),
        op: z.enum(['add', 'swap', 'move']),
        cause: z.enum(['plan', 'fallback']),
        reason: z.string(),
      })
      .optional(),
    /** The id of the stage row this view shows: the key of the owner's mark route. */
    row_id: z.number().int().positive().optional(),
    /** The owner's marks on this row's findings, by position in `findings`. */
    marks: z
      .array(
        z.object({
          index: z.number().int().nonnegative(),
          verdict: z.enum(['real', 'false_alarm']),
        }),
      )
      .optional(),
    /** What the stage's latest run actually used: the harness, the model and the fallback slot (-1 = substitute). */
    ran_on: z
      .object({
        harness: z.string(),
        model: z.string().optional(),
        slot: z.number().int().min(-1).max(5),
      })
      .optional(),
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
  /** The Director's adjustment log for this ticket, applied and dropped. */
  adjustments: z.array(PipelineAdjustment),
  /** Stages the Director removed, so the strip can show them as ghosts. */
  removed: z.array(z.object({ id: z.string(), label: z.string(), reason: z.string() })),
  base_hash: z.string(),
  rework: z.object({
    count: z.number().int().nonnegative(),
    cap: z.number().int().positive(),
  }),
});
export type TicketPipelineView = z.infer<typeof TicketPipelineView>;
