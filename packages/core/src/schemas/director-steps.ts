/**
 * Planning step output schemas — what the Director's planning steps must answer.
 *
 * Why: every planning step is a model call whose answer the engine acts on, so each answer is
 *   held to a schema before anything is written (rule 4). The survey and verify steps are
 *   tool-less: they may ask the engine to read files (`read_requests`), the engine runs those
 *   reads through `admit()` under the director grant and calls the step again with the results
 *   (d-0131, d-0141 item 4), so a read is deterministic, recorded and harness-neutral. The
 *   grill step asks one question at a time with clickable options. The approval step sees only
 *   typed findings and answers `approve` or `ask_owner`, so text read from the repo cannot talk
 *   it into approving (d-0141 item 6). Plan tickets are validated as a graph here so a plan
 *   with a loop never reaches storage.
 *
 *   The two escalation steps follow the same rule. `ticket_answer` is the Director's first look
 *   at a Worker's question: it may answer alone only with cited grounds and a confidence the
 *   engine compares with the owner's threshold, and otherwise hands the owner a suggestion and
 *   options. `ticket_recover` looks at a failed ticket and either allows one more try with a
 *   note or hands over a diagnosis. Neither can approve a tool or a login: those never reach
 *   the Director.
 *
 * Exports: MAX_READ_REQUESTS, ReadRequest, ReadRequests, CardSurveyOutput, VerifyOutput,
 *   GrillTurnOutput, EnhanceOutput, WritePlanOutput, ApprovePlanOutput, CustomStepOutput,
 *   ANSWER_GROUND_KINDS, ESCALATE_REASONS, TicketAnswerOutput, TicketRecoverOutput, PickSubstituteOutput,
 *   DraftAgentOutput.
 * Depends on: schemas/agent, schemas/escalation, schemas/grill, schemas/ids, schemas/plan, zod. No IO.
 */

import { z } from 'zod';
import { EscalationOption, MAX_OPTIONS } from '#/schemas/escalation.js';
import { GrillQuestionDraft, SurveyFindings, VerifyFindings } from '#/schemas/grill.js';
import { AgentId, AgentInput } from '#/schemas/agent.js';
import { CardId } from '#/schemas/ids.js';
import { PlanTickets } from '#/schemas/plan.js';

/** One engine-side read round carries at most this many requests. */
export const MAX_READ_REQUESTS = 20;

/** A read the step asks the engine to run: one file, a text search, or a path pattern. */
export const ReadRequest = z.discriminatedUnion('op', [
  z.object({ op: z.literal('read'), path: z.string().min(1) }),
  z.object({
    op: z.literal('grep'),
    pattern: z.string().min(1),
    glob: z.string().min(1).optional(),
  }),
  z.object({ op: z.literal('glob'), pattern: z.string().min(1) }),
]);
export type ReadRequest = z.infer<typeof ReadRequest>;

export const ReadRequests = z.array(ReadRequest).max(MAX_READ_REQUESTS);

/** Which later steps run, for steps whose `when` is `director_decides`; absent means all do. */
const StepDecisions = z.record(z.string(), z.boolean()).optional();

/** `card_survey`: either more reads wanted, or the findings. */
export const CardSurveyOutput = z
  .object({
    read_requests: ReadRequests.optional(),
    findings: SurveyFindings.optional(),
    step_decisions: StepDecisions,
  })
  .refine((o) => (o.read_requests?.length ?? 0) > 0 || o.findings !== undefined, {
    message: 'answer with read_requests or findings',
  });
export type CardSurveyOutput = z.infer<typeof CardSurveyOutput>;

/** `verify`: either more reads wanted, or the typed findings the floor reads. */
export const VerifyOutput = z
  .object({
    read_requests: ReadRequests.optional(),
    findings: VerifyFindings.optional(),
    step_decisions: StepDecisions,
  })
  .refine((o) => (o.read_requests?.length ?? 0) > 0 || o.findings !== undefined, {
    message: 'answer with read_requests or findings',
  });
export type VerifyOutput = z.infer<typeof VerifyOutput>;

/**
 * `grill_turn`: the next question, or done. The zero-question path is `done` on the first
 * call with reason `zero_question`; `open_points` counts what is still open, this question
 * included.
 */
export const GrillTurnOutput = z
  .object({
    done: z.boolean(),
    done_reason: z.enum(['nothing_open', 'zero_question']).optional(),
    question: GrillQuestionDraft.optional(),
    open_points: z.number().int().nonnegative(),
    assumptions: z.array(z.string()),
  })
  .refine((o) => (o.done ? o.done_reason !== undefined : o.question !== undefined), {
    message: 'a finished grill needs done_reason; an unfinished one needs a question',
  });
export type GrillTurnOutput = z.infer<typeof GrillTurnOutput>;

/** `enhance`: the markdown report, what the Director resolved itself, and points only the owner can settle. */
export const EnhanceOutput = z.object({
  summary: z.string(),
  report: z.string().min(1),
  assumptions: z.array(z.string()),
  owner_questions: z.array(GrillQuestionDraft).max(4),
});
export type EnhanceOutput = z.infer<typeof EnhanceOutput>;

/**
 * `write_plan`: the plan body. Decisions come from the stored grill answers and the
 * verification block from the verify findings, both written by the engine, so the plan
 * cannot drift from what was asked and found.
 */
export const WritePlanOutput = z.object({
  summary: z.string(),
  goal: z.string().min(1),
  scope: z.array(z.string()),
  non_goals: z.array(z.string()),
  assumptions: z.array(z.string()),
  risks: z.array(z.string()),
  tickets: PlanTickets.refine((t) => t.length > 0, { message: 'a plan needs a ticket' }),
  card_links: z.array(CardId),
});
export type WritePlanOutput = z.infer<typeof WritePlanOutput>;

/** `approve_plan`: tool-less, over the plan, typed findings and the floor result only. */
export const ApprovePlanOutput = z
  .object({
    decision: z.enum(['approve', 'ask_owner']),
    questions: z.array(z.string()),
  })
  .refine((o) => o.decision === 'approve' || o.questions.length > 0, {
    message: 'ask_owner needs at least one question',
  });
export type ApprovePlanOutput = z.infer<typeof ApprovePlanOutput>;

/** `custom_step`: an owner-defined step answers with a summary and notes for the steps after it. */
export const CustomStepOutput = z.object({
  summary: z.string(),
  notes: z.array(z.string()),
  step_decisions: StepDecisions,
});
export type CustomStepOutput = z.infer<typeof CustomStepOutput>;

/** What a `ticket_answer` ground points at; the engine requires at least one ground to auto-answer. */
export const ANSWER_GROUND_KINDS = ['plan', 'decision', 'memory', 'code'] as const;

/** Why the Director hands a question to the owner. */
export const ESCALATE_REASONS = [
  'low_confidence',
  'out_of_plan',
  'owner_preference',
  'conflict',
  'tier_c',
] as const;

/**
 * `ticket_answer`: tool-less (reads go through the engine like the planning steps). `answer`
 * means "I can settle this myself" and must carry the text; `escalate` hands the question to the
 * owner, optionally with a suggested answer and 2 to 4 options (at most one recommended). A
 * model that wants a read first sets `read_requests` and any decision: the engine runs the reads
 * and calls again.
 */
export const TicketAnswerOutput = z
  .object({
    read_requests: ReadRequests.optional(),
    decision: z.enum(['answer', 'escalate']),
    answer: z.string().trim().min(1).optional(),
    confidence: z.number().min(0).max(1),
    grounds: z.array(
      z.object({ kind: z.enum(ANSWER_GROUND_KINDS), ref: z.string().min(1) }),
    ),
    suggested_answer: z.string().trim().min(1).optional(),
    options: z
      .array(EscalationOption)
      .min(2)
      .max(MAX_OPTIONS)
      .refine((o) => o.filter((x) => x.recommended).length <= 1, {
        message: 'at most one option may be recommended',
      })
      .optional(),
    escalate_reason: z.enum(ESCALATE_REASONS).optional(),
  })
  .refine((o) => o.decision !== 'answer' || o.answer !== undefined, {
    message: 'decision answer needs the answer text',
    path: ['answer'],
  });
export type TicketAnswerOutput = z.infer<typeof TicketAnswerOutput>;

/** `ticket_recover`: one more try with a note that stays inside the ticket's acceptance, or a diagnosis for the owner. */
export const TicketRecoverOutput = z.object({
  decision: z.enum(['retry', 'escalate']),
  note: z.string().trim().min(1).max(1000).optional(),
  diagnosis: z.string().trim().min(1),
  confidence: z.number().min(0).max(1),
});
export type TicketRecoverOutput = z.infer<typeof TicketRecoverOutput>;

/**
 * `pick_substitute`: tool-less. The engine already filtered the candidates (same role, usable, harness
 * ready, writer scope within the original's, critic family rule); the model chooses one of them or
 * pauses for the owner. A pick outside the list is refused by the engine, never trusted.
 */
export const PickSubstituteOutput = z
  .object({
    decision: z.enum(['substitute', 'pause']),
    agent: AgentId.optional(),
    reason: z.string().trim().min(10).max(500),
  })
  .refine((o) => o.decision !== 'substitute' || o.agent !== undefined, {
    message: 'decision substitute needs the agent',
    path: ['agent'],
  });
export type PickSubstituteOutput = z.infer<typeof PickSubstituteOutput>;

/** `draft_agent`: a proposed agent definition, why, and what the Director could not decide; nothing is saved from it. */
export const DraftAgentOutput = z.object({
  definition: AgentInput,
  rationale: z.string().max(1000),
  questions: z.array(z.string()).max(3),
});
export type DraftAgentOutput = z.infer<typeof DraftAgentOutput>;
