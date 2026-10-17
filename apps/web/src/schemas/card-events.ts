/**
 * Payload schemas of the card events the Director's planning flow writes.
 *
 * Why: the card chat and the Plan tab are driven by events (a grill question, an answer, a
 *   plan that is ready, a needs-you raise). The server writes them, but the UI may be older or
 *   newer than the server, and a payload is untrusted text from a model run. Each kind gets a
 *   forgiving schema (missing optional fields default) and is read with `safeParse`, so a
 *   malformed payload becomes a neutral system line instead of a crashed chat. The history
 *   schema itself stays open to any kind (schemas/cards).
 *
 * Exports: GrillOption, GrillQuestion, GrillAnswer, GrillDone, PlanReady, PlanApproved,
 *   PlanChangesRequested, NeedsYou, StepStarted, StepFinished, NEEDS_YOU_ACTIONS,
 *   NeedsYouAction, EscalationRaised, EscalationSettledEvent, ReplanRequested (schemas and
 *   inferred types).
 * Depends on: zod.
 */

import { z } from 'zod';

export const GrillOption = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  recommended: z.boolean().default(false),
});
export type GrillOption = z.infer<typeof GrillOption>;

export const GrillQuestion = z.object({
  question_id: z.string().min(1),
  text: z.string().min(1),
  why: z.string().optional(),
  options: z.array(GrillOption).default([]),
  allow_other: z.boolean().default(true),
  open_points: z.number().int().nonnegative().default(0),
});
export type GrillQuestion = z.infer<typeof GrillQuestion>;

export const GrillAnswer = z.object({
  question_id: z.string().min(1),
  option_id: z.string().optional(),
  text: z.string().optional(),
  by: z.enum(['owner', 'recommendation']).catch('owner'),
});
export type GrillAnswer = z.infer<typeof GrillAnswer>;

export const GrillDone = z.object({
  reason: z.string().default(''),
  assumptions: z.array(z.string()).default([]),
});
export type GrillDone = z.infer<typeof GrillDone>;

export const PlanReady = z.object({
  version: z.number().int().positive(),
  ticket_count: z.number().int().nonnegative().default(0),
  auto_approve_eligible: z.boolean().default(false),
});
export type PlanReady = z.infer<typeof PlanReady>;

export const PlanApproved = z.object({
  version: z.number().int().positive(),
  by: z.string().default('owner'),
  ticket_ids: z.array(z.string()).default([]),
});
export type PlanApproved = z.infer<typeof PlanApproved>;

export const PlanChangesRequested = z.object({
  version: z.number().int().positive(),
  comment: z.string().default(''),
});
export type PlanChangesRequested = z.infer<typeof PlanChangesRequested>;

export const NeedsYouAction = z.enum([
  'answer',
  'approve_plan',
  'request_changes',
  'start_planning',
  'run_as_express',
  'raise_step_budget',
  'retry_step',
]);
export type NeedsYouAction = z.infer<typeof NeedsYouAction>;
export const NEEDS_YOU_ACTIONS = NeedsYouAction.options;

export const NeedsYou = z.object({
  reason: z.string().default('This card needs you.'),
  // Unknown actions are dropped, never shown as a button that does nothing.
  actions: z
    .array(z.string())
    .default([])
    .transform((list) =>
      list.filter((a): a is NeedsYouAction => NeedsYouAction.safeParse(a).success),
    ),
  ticket_id: z.string().optional(),
});
export type NeedsYou = z.infer<typeof NeedsYou>;

/** A ticket escalation reached the owner. The chat draws it from the live view, not this payload. */
export const EscalationRaised = z.object({
  interaction_id: z.string().min(1),
  ticket_id: z.string().min(1),
  escalation_kind: z.string().default('question'),
  title: z.string().default('A ticket needs you'),
});
export type EscalationRaised = z.infer<typeof EscalationRaised>;

/** An escalation was settled, by the owner, the Director or by itself. */
export const EscalationSettledEvent = z.object({
  interaction_id: z.string().min(1),
  ticket_id: z.string().min(1),
  action: z.string(),
  by: z.enum(['owner', 'director', 'auto']).catch('owner'),
  note: z.string().optional(),
});
export type EscalationSettledEvent = z.infer<typeof EscalationSettledEvent>;

/** The owner sent the card back to planning from a stopped ticket. */
export const ReplanRequested = z.object({
  ticket_id: z.string().optional(),
  comment: z.string().default(''),
});
export type ReplanRequested = z.infer<typeof ReplanRequested>;

export const StepStarted = z.object({
  step_id: z.string().min(1),
  step_kind: z.string().default(''),
  label: z.string().default('Working'),
});
export type StepStarted = z.infer<typeof StepStarted>;

export const StepFinished = StepStarted.extend({
  files_read: z
    .array(z.object({ path: z.string(), bytes: z.number().default(0) }))
    .default([]),
  summary: z.string().default(''),
});
export type StepFinished = z.infer<typeof StepFinished>;
