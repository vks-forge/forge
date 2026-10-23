/**
 * Escalation schemas — every wait on the owner, as one typed payload, one action set, one view.
 *
 * Why: a ticket stops for a person in many ways (a Worker's question, a lane no pipeline serves
 *   yet, a retry cap, a signed-out harness, an unapproved tool, a question nobody answered), and
 *   the owner meets them in three places: the Inbox, the Card page and the Ticket page. If each
 *   producer wrote its own text, each screen would invent its own buttons and some wait would end
 *   up with no way forward (d-0135). One payload union says what is wrong and why, one action
 *   enum says what the owner can do about it, and one view is what every screen reads, so the
 *   Director's first attempt (a suggested answer, a diagnosis, the attempts so far) and the
 *   owner's choice share a shape. Escalations reuse the `interactions` row (d-0141 item 8): the
 *   payload rides in `payload_json` and the answer in `answer_json`. Two kinds cover finished
 *   work: a `decision` is a held ticket (a stage's findings, or work that outgrew its plan) and a
 *   `sign_off` is finished work waiting for the owner's name; both start at the owner (the
 *   Director's first look has nothing to add) and their overriding options need a written reason.
 *
 * Exports: EscalationKind, FAILURE_CAUSES, FailureCause, EscalationOption, EscalationQuestion, EscalationFailure, EscalationSetup, DECISION_CAUSES,
 *   DecisionCause, EscalationDecision, SIGN_OFF_CAUSES, SignOffCause, EscalationSignOff, EscalationPayload, ESCALATION_ACTIONS, EscalationAction,
 *   EscalationActor, EscalationAnswer, EscalationStage, EscalationSettled, EscalationView, EscalationList, EscalationActBody, MAX_OPTIONS.
 * Depends on: schemas/errors, schemas/escalation-{conflict,permission,setup}, schemas/finding, schemas/ids, schemas/interaction, schemas/pipeline, schemas/ticket, zod. No IO.
 */

import { z } from 'zod';
import { ErrorFamily } from '#/schemas/errors.js';
import { EscalationConflict } from '#/schemas/escalation-conflict.js';
import { EscalationPermission } from '#/schemas/escalation-permission.js';
import { SetupCause } from '#/schemas/escalation-setup.js';
import { Finding } from '#/schemas/finding.js';
import { CardId, TicketId } from '#/schemas/ids.js';
import { InteractionStatus } from '#/schemas/interaction.js';
import { Severity, StageId } from '#/schemas/pipeline.js';
import { Lane, Tier } from '#/schemas/ticket.js';

export const EscalationKind = z.enum([
  'question',
  'failure',
  'setup',
  'decision',
  'sign_off',
  'permission',
]);
export type EscalationKind = z.infer<typeof EscalationKind>;

/** Why a ticket failed and waits; the order is the order the contract lists them. */
export const FAILURE_CAUSES = [
  'lane_hold',
  'rework_cap',
  'retry_cap',
  'rewake_cap',
  'not_retried',
  'max_turns',
  'refused',
  'question_timeout',
  'no_agent_available',
  'merge_conflict',
] as const;
export const FailureCause = z.enum(FAILURE_CAUSES);
export type FailureCause = z.infer<typeof FailureCause>;

export const MAX_OPTIONS = 4; // clickable options per question

export const EscalationOption = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  recommended: z.boolean(),
});
export type EscalationOption = z.infer<typeof EscalationOption>;

/** Zero to four options, at most one of them recommended. */
export const EscalationOptions = z
  .array(EscalationOption)
  .max(MAX_OPTIONS)
  .refine((o) => o.filter((x) => x.recommended).length <= 1, {
    message: 'at most one option may be recommended',
  });

export const EscalationQuestion = z.object({
  kind: z.literal('question'),
  text: z.string().min(1),
  source: z.enum(['ask_director', 'report_blocked', 'legacy']),
  suggested_answer: z.string().min(1).optional(),
  options: EscalationOptions,
  director_note: z.string().min(1).optional(),
});
export type EscalationQuestion = z.infer<typeof EscalationQuestion>;

export const EscalationFailure = z.object({
  kind: z.literal('failure'),
  cause: FailureCause,
  summary: z.string().min(1),
  diagnosis: z.string().min(1).optional(),
  /** What was tried so far (runs, the Director's own retry), oldest first. */
  attempts: z.array(
    z.object({ at: z.iso.datetime(), what: z.string(), result: z.string() }),
  ),
  error_family: ErrorFamily.optional(),
  lane: Lane.optional(),
  /** The limit a run hit, with whose setting it was and the web path that raises it (a turn limit today). */
  limit: z
    .object({
      kind: z.literal('turns'),
      value: z.number().int().positive(),
      source: z.enum(['agent', 'forge']),
      fix_href: z.string().min(1),
    })
    .optional(),
  /** A merge conflict the resolver could not finish: the clashing files and the upstream tickets that changed them first. */
  conflict: EscalationConflict.optional(),
});
export type EscalationFailure = z.infer<typeof EscalationFailure>;

export const EscalationSetup = z.object({
  kind: z.literal('setup'),
  cause: SetupCause,
  summary: z.string().min(1),
  /** Web path of the screen that fixes it, e.g. `/settings/harnesses/claude-code#tools`. */
  fix_href: z.string().min(1),
});
export type EscalationSetup = z.infer<typeof EscalationSetup>;

/** Why a held ticket waits for a decision: a stage's findings it will not send back again, gate configuration files the Worker changed, files whose earlier-run proof is gone, or work that outgrew its plan. */
export const DECISION_CAUSES = [
  'findings_hold',
  'config_hold',
  'provenance_hold',
  'scope_drift',
] as const;
export const DecisionCause = z.enum(DECISION_CAUSES);
export type DecisionCause = z.infer<typeof DecisionCause>;

/** A held ticket's choice (d-0135): merge anyway, send back or re-plan for findings; continue or re-plan for scope drift. */
export const EscalationDecision = z.object({
  kind: z.literal('decision'),
  cause: DecisionCause,
  summary: z.string().min(1),
  stage_id: StageId,
  stage_label: z.string().min(1),
  /** The blocking findings, capped. */
  findings: z.array(Finding).max(20),
  /** Scope drift: changed files the plan did not name. */
  unplanned: z.array(z.string()).max(50).optional(),
  rework: z.object({
    count: z.number().int().nonnegative(),
    cap: z.number().int().positive(),
  }),
});
export type EscalationDecision = z.infer<typeof EscalationDecision>;

export const SIGN_OFF_CAUSES = [
  'tier_b',
  'tier_c',
  'owner_stage',
  'director_declined',
] as const;
export const SignOffCause = z.enum(SIGN_OFF_CAUSES);
export type SignOffCause = z.infer<typeof SignOffCause>;

/** Finished work waiting for the owner's name: why it did not go through the Director, and what passed. */
export const EscalationSignOff = z.object({
  kind: z.literal('sign_off'),
  cause: SignOffCause,
  tier: Tier,
  summary: z.string().min(1),
  /** Why the Director did not sign, when it looked first. */
  director_note: z.string().min(1).optional(),
  checks: z.object({
    passed: z.number().int().nonnegative(),
    counts: z.record(Severity, z.number().int().nonnegative()),
    overrides: z.number().int().nonnegative(),
  }),
});
export type EscalationSignOff = z.infer<typeof EscalationSignOff>;

export const EscalationPayload = z.discriminatedUnion('kind', [
  EscalationQuestion,
  EscalationFailure,
  EscalationSetup,
  EscalationDecision,
  EscalationSignOff,
  EscalationPermission,
]);
export type EscalationPayload = z.infer<typeof EscalationPayload>;

/** What the owner can do; "fix in settings" is a link, not an action. */
export const ESCALATION_ACTIONS = [
  'answer',
  'retry',
  'replan',
  'cancel',
  'run_as_express',
  'rework',
  'recheck',
  'approve',
  'sign_off',
  /** Owner only: merge held work although a check found blocking findings (comment recorded). */
  'merge_anyway',
  /** Owner only: carry on although the work outgrew its plan (comment recorded). */
  'continue',
  /** Engine only: a held ticket's lane went live and the hold lifted by itself; never offered as a button. */
  'pipeline_ready',
  /** Engine / Director only: a stage's agent was swapped for a substitute after its fallbacks ran out; never a button. */
  'substitute',
  /** Owner only: answers to a tool approval (d-0175). */
  'allow_once',
  'allow_always',
  'deny',
  /** Owner only: start the Worker although the worktree's setup steps failed (Forge records the skip). */
  'skip_setup',
] as const;
export const EscalationAction = z.enum(ESCALATION_ACTIONS);
export type EscalationAction = z.infer<typeof EscalationAction>;

export const EscalationActor = z.enum(['owner', 'director', 'auto']);
export type EscalationActor = z.infer<typeof EscalationActor>;

/** What is stored in `answer_json` when an escalation is settled. */
export const EscalationAnswer = z.object({
  action: EscalationAction,
  by: EscalationActor,
  text: z.string().optional(),
  option_id: z.string().optional(),
  note: z.string().optional(),
  comment: z.string().optional(),
  cascade: z.boolean().optional(),
  /** `allow_always`: the project settings version that stored the rule. */
  settings_version: z.number().int().positive().optional(),
});
export type EscalationAnswer = z.infer<typeof EscalationAnswer>;

/** `director` while the Director is looking at it (hidden from the owner); `owner` once it waits on the owner. */
export const EscalationStage = z.enum(['director', 'owner']);
export type EscalationStage = z.infer<typeof EscalationStage>;

export const EscalationSettled = z.object({
  action: EscalationAction,
  by: EscalationActor,
  at: z.iso.datetime(),
});
export type EscalationSettled = z.infer<typeof EscalationSettled>;

/** What every screen reads. `actions` has at least one entry while the escalation is pending. */
export const EscalationView = z.object({
  id: z.string().min(1),
  ticket_id: TicketId,
  ticket_title: z.string(),
  card_id: CardId.optional(),
  kind: EscalationKind,
  stage: EscalationStage,
  status: InteractionStatus,
  payload: EscalationPayload,
  actions: z.array(EscalationAction),
  asked_at: z.iso.datetime(),
  escalated_at: z.iso.datetime().optional(),
  settled: EscalationSettled.optional(),
});
export type EscalationView = z.infer<typeof EscalationView>;

/** `GET /cards/:id/escalations`: pending first, then the last settled ones. */
export const EscalationList = z.object({ items: z.array(EscalationView) });
export type EscalationList = z.infer<typeof EscalationList>;

const comment = z.string().trim().min(5);

export const EscalationActBody = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('answer'),
      option_id: z.string().min(1).optional(),
      text: z.string().trim().min(1).optional(),
    })
    .refine((b) => (b.option_id === undefined) !== (b.text === undefined), {
      message: 'answer with exactly one of option_id and text',
    }),
  z.object({ action: z.literal('retry'), note: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal('replan'), comment }),
  z.object({
    action: z.literal('cancel'),
    cascade: z.boolean().optional(),
    /** Why the owner cancels; written on the ticket's history and shown to the Director. */
    reason: z.string().trim().min(1).max(500).optional(),
  }),
  z.object({ action: z.literal('run_as_express') }),
  z.object({ action: z.literal('rework'), comment }),
  z.object({ action: z.literal('recheck') }),
  z.object({ action: z.literal('merge_anyway'), comment }),
  z.object({ action: z.literal('continue'), comment }),
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('allow_once') }),
  z.object({ action: z.literal('allow_always') }),
  z.object({ action: z.literal('deny'), note: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal('skip_setup') }),
  z.object({
    action: z.literal('sign_off'),
    signer: z.string().trim().min(1).max(100).optional(),
  }),
]);
export type EscalationActBody = z.infer<typeof EscalationActBody>;
