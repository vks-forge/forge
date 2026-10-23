/**
 * Grill schemas — the questions the Director asks, the answers, and the card's planning state.
 *
 * Why: the grill is a conversation, but the Director must not carry it as raw chat: a long
 *   card would exceed its context and a restart would lose what was already settled (d-0130,
 *   d-0141 item 7). The settled facts are structured card data: the open question, the answers
 *   given, the assumptions made, the findings of the survey and verify steps and a short
 *   summary of every finished step. Each step reads that state, so the flow resumes exactly
 *   where it stopped after a restart, and a Request changes re-asks only the points that
 *   changed. A question always has two to four options with exactly one recommended, so the
 *   owner can answer with a click and the "use recommendations" shortcut has something to use.
 *
 * Exports: GrillOption, GrillQuestion, GrillQuestionDraft, GrillAnswer, GrillDoneReason, GrillRecord,
 *   SurveyFindings, VerifyFindings, StepSummary, FilesRead, GrillState.
 * Depends on: schemas/ids, schemas/plan, schemas/ticket, zod. No IO.
 */

import { z } from 'zod';
import { FloorResult, PlanOverlap } from '#/schemas/plan.js';
import { Lane } from '#/schemas/ticket.js';

const exactlyOneRecommended = (o: readonly { recommended: boolean }[]): boolean =>
  o.filter((x) => x.recommended).length === 1;

/** One clickable answer; the owner may always write their own instead (`allow_other`). */
export const GrillOption = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(200),
  recommended: z.boolean(),
});
export type GrillOption = z.infer<typeof GrillOption>;

/** A question as the card shows it (the `grill_question` event payload). */
export const GrillQuestion = z.object({
  question_id: z.string().min(1),
  text: z.string().trim().min(1),
  why: z.string().optional(),
  options: z.array(GrillOption).min(2).max(4).refine(exactlyOneRecommended, {
    message: 'exactly one option must be recommended',
  }),
  allow_other: z.literal(true),
  /** Points still open, this question included. */
  open_points: z.number().int().nonnegative(),
});
export type GrillQuestion = z.infer<typeof GrillQuestion>;

/** A question as the model writes it; the engine numbers it and its options. */
export const GrillQuestionDraft = z.object({
  text: z.string().trim().min(1),
  why: z.string().optional(),
  options: z
    .array(
      z.object({ label: z.string().trim().min(1).max(200), recommended: z.boolean() }),
    )
    .min(2)
    .max(4)
    .refine(exactlyOneRecommended, { message: 'exactly one option must be recommended' }),
});
export type GrillQuestionDraft = z.infer<typeof GrillQuestionDraft>;

/** What the owner (or the "use recommendations" shortcut) answered. */
export const GrillAnswer = z.object({
  question_id: z.string().min(1),
  option_id: z.string().min(1).optional(),
  text: z.string().min(1).optional(),
  by: z.enum(['owner', 'recommendation']),
});
export type GrillAnswer = z.infer<typeof GrillAnswer>;

export const GrillDoneReason = z.enum([
  'nothing_open',
  'owner_enough',
  'use_recommendations',
  'zero_question',
]);
export type GrillDoneReason = z.infer<typeof GrillDoneReason>;

/** A settled point: the question as asked and the answer in plain words. */
export const GrillRecord = z.object({
  question_id: z.string().min(1),
  question: z.string(),
  answer: z.string(),
  by: z.enum(['owner', 'recommendation']),
});
export type GrillRecord = z.infer<typeof GrillRecord>;

/** What the survey step found in the code, kept for the later steps. */
export const SurveyFindings = z.object({
  summary: z.string(),
  relevant_files: z.array(z.string()).default([]),
  existing_code: z.array(z.string()).default([]),
  conventions: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  predicted_lane: Lane.optional(),
  predicted_files: z.array(z.string()).default([]),
  /** Set by the engine when the survey answered without reading any file of a repository that has some; the grill then must not ask what code could answer. */
  read_nothing: z.boolean().optional(),
});
export type SurveyFindings = z.infer<typeof SurveyFindings>;

/** What the verify step found; the floor reads these typed fields, never prose. */
export const VerifyFindings = z.object({
  summary: z.string(),
  blast_radius: z.string(),
  overlaps: z.array(PlanOverlap).default([]),
  matching_decisions: z.array(z.string()).default([]),
  rejected_hits: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  predicted_files: z.array(z.string()).default([]),
});
export type VerifyFindings = z.infer<typeof VerifyFindings>;

/** One finished step in a line, handed to the steps after it. */
export const StepSummary = z.object({
  step_id: z.string().min(1),
  step_kind: z.string().min(1),
  label: z.string(),
  summary: z.string(),
});
export type StepSummary = z.infer<typeof StepSummary>;

/** Files a step read, with their size in bytes. */
export const FilesRead = z.array(
  z.object({ path: z.string(), bytes: z.number().int().nonnegative() }),
);
export type FilesRead = z.infer<typeof FilesRead>;

/** The owner's request to change a plan, held until the re-grill has run. */
const PendingChanges = z.object({
  version: z.number().int().positive(),
  comment: z.string().min(1),
});

/** The ticket stop a Re-plan came from, held until the next plan is written so every planning step sees it. */
const ReplanFrom = z.object({
  ticket_id: z.string().min(1),
  stop: z.record(z.string(), z.unknown()),
});

/**
 * Everything the planning flow remembers about one card (`cards.grill_state_json`). Every
 * field has a default so a card that never planned reads as `{}`.
 */
export const GrillState = z.object({
  current: GrillQuestion.nullable().default(null),
  queued: z.array(GrillQuestionDraft).default([]),
  answers: z.array(GrillRecord).default([]),
  asked: z.number().int().nonnegative().default(0),
  round_asked: z.number().int().nonnegative().default(0),
  rounds: z.number().int().nonnegative().default(0),
  /** True from the first model turn of a grill round until the grill step finishes (so a retry does not start a round twice). */
  round_open: z.boolean().default(false),
  open_points: z.number().int().nonnegative().nullable().default(null),
  assumptions: z.array(z.string()).default([]),
  done: z.boolean().default(false),
  done_reason: GrillDoneReason.nullable().default(null),
  survey: SurveyFindings.nullable().default(null),
  verify: VerifyFindings.nullable().default(null),
  enhance_report: z.string().default(''),
  step_summaries: z.array(StepSummary).default([]),
  step_decisions: z.record(z.string(), z.boolean()).default({}),
  predicted_lane: Lane.nullable().default(null),
  files_read: FilesRead.default([]),
  base_sha: z.string().nullable().default(null),
  pending_changes: PendingChanges.nullable().default(null),
  replan_from: ReplanFrom.nullable().default(null),
  floor: FloorResult.nullable().default(null),
  /** Dollars the card's Director steps cost (the card budget counts them, d-0143). */
  director_spend_usd: z.number().nonnegative().default(0),
});
export type GrillState = z.infer<typeof GrillState>;
