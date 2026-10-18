/**
 * Scorecard schemas — how each agent and each pipeline shape has been doing, computed on read.
 *
 * Why: choosing an agent for a stage, or deciding a lane's pipeline needs a track record, and the
 *   owner should see the same numbers the Director reads (d-0081). A scorecard is never stored and
 *   never applied: nothing here changes a default, an assignment or a pipeline by itself. Every
 *   figure that has no data is `null` (never a flattering zero), a run with no recorded cost adds to
 *   a coverage count instead of a guessed price, and a row built on fewer than five tickets is
 *   flagged `insufficient` so neither the owner nor the Director reads a trend into noise.
 *
 * Exports: SCORECARD_SLICES, SCORECARD_RANGES, MIN_SCORECARD_TICKETS, ScorecardSlice, ScorecardRange,
 *   ScorecardRow, AgentScorecard, ShapeScorecard, ScorecardReply, FindingVerdict, FindingMark,
 *   MarkFindingBody (and their types).
 * Depends on: schemas/ids, schemas/pipeline, schemas/project-stats, schemas/agent, schemas/ticket, zod. No IO.
 */

import { z } from 'zod';
import { AgentId, AgentRole } from '#/schemas/agent.js';
import { Lane } from '#/schemas/ticket.js';
import { Severity } from '#/schemas/pipeline.js';
import { DurationStats, RateStat } from '#/schemas/project-stats.js';

/** How a card's rows are cut: all tickets together, or by ticket type, tier or lane. */
export const SCORECARD_SLICES = ['all', 'type', 'tier', 'lane'] as const;
export const ScorecardSlice = z.enum(SCORECARD_SLICES);
export type ScorecardSlice = z.infer<typeof ScorecardSlice>;

export const SCORECARD_RANGES = ['30d', '90d'] as const;
export const ScorecardRange = z.enum(SCORECARD_RANGES);
export type ScorecardRange = z.infer<typeof ScorecardRange>;

/** A row built on fewer tickets than this reads "too few to judge". */
export const MIN_SCORECARD_TICKETS = 5;

const Count = z.number().int().nonnegative();

export const ScorecardRow = z.object({
  by: ScorecardSlice,
  /** The slice value (a ticket type, tier or lane); absent for `all`. */
  value: z.string().min(1).optional(),
  tickets: Count,
  runs: Count,
  insufficient: z.boolean(),
  /** Writers, testers and pipeline shapes: finished tickets that never needed a rework, of those the agent took part in. */
  clean_rate: RateStat.nullable(),
  /** Check agents: stage rows that passed the first time, of the rows finished. */
  pass_rate: RateStat.nullable(),
  reworks_per_ticket: z.number().nonnegative().nullable(),
  holds: Count,
  overrides: Count,
  cost: z.object({
    total_usd: z.number().nonnegative(),
    per_ticket_usd: z.number().nonnegative().nullable(),
    coverage: RateStat,
  }),
  duration: DurationStats,
  fallback_runs: Count,
  substituted: Count,
  findings: z
    .object({
      by_severity: z.record(Severity, Count),
      real: Count,
      false_alarm: Count,
      acted_on: Count,
      overruled: Count,
      unjudged: Count,
    })
    .optional(),
});
export type ScorecardRow = z.infer<typeof ScorecardRow>;

export const AgentScorecard = z.object({
  agent_id: AgentId,
  name: z.string(),
  role: AgentRole,
  rows: z.array(ScorecardRow),
});
export type AgentScorecard = z.infer<typeof AgentScorecard>;

/** One pipeline shape (the stage list a ticket really ran), with the Director-changed ones marked. */
export const ShapeScorecard = z.object({
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  lane: Lane,
  /** "Standard", or "Standard + security-reviewer" when the shape differs from the lane's own list. */
  label: z.string(),
  stages: z.array(z.string()),
  director_changed: z.boolean(),
  rows: z.array(ScorecardRow),
});
export type ShapeScorecard = z.infer<typeof ShapeScorecard>;

/** `GET /projects/:slug/scorecards`. */
export const ScorecardReply = z.object({
  range: ScorecardRange,
  agents: z.array(AgentScorecard),
  shapes: z.array(ShapeScorecard),
  computed_at: z.iso.datetime(),
});
export type ScorecardReply = z.infer<typeof ScorecardReply>;

/** The owner's mark on one finding; it beats every derived verdict. */
export const FindingVerdict = z.enum(['real', 'false_alarm']);
export type FindingVerdict = z.infer<typeof FindingVerdict>;

export const FindingMark = z.object({
  stage_run_id: z.number().int().positive(),
  finding_index: z.number().int().nonnegative(),
  verdict: FindingVerdict,
  marked_at: z.iso.datetime(),
});
export type FindingMark = z.infer<typeof FindingMark>;

/** `PUT /tickets/:id/findings/:stageRunId/:index/mark`; null clears the mark. */
export const MarkFindingBody = z.object({ verdict: FindingVerdict.nullable() });
export type MarkFindingBody = z.infer<typeof MarkFindingBody>;
