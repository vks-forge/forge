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
 *   payload rides in `payload_json` and the answer in `answer_json`.
 *
 * Exports: EscalationKind, FAILURE_CAUSES, FailureCause, SetupCause, EscalationOption,
 *   EscalationQuestion, EscalationFailure, EscalationSetup, EscalationPayload, ESCALATION_ACTIONS,
 *   EscalationAction, EscalationActor, EscalationAnswer, EscalationStage, EscalationSettled,
 *   EscalationView, EscalationList, EscalationActReply, TicketActReply, EscalationActBody, MAX_OPTIONS.
 * Depends on: schemas/errors, schemas/harness, schemas/ids, schemas/interaction, schemas/ticket, zod. No IO.
 */

import { z } from 'zod';
import { ErrorFamily } from '#/schemas/errors.js';
import { HarnessId, HarnessKind } from '#/schemas/harness.js';
import { CardId, TicketId } from '#/schemas/ids.js';
import { InteractionStatus } from '#/schemas/interaction.js';
import { Lane } from '#/schemas/ticket.js';

export const EscalationKind = z.enum(['question', 'failure', 'setup']);
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
] as const;
export const FailureCause = z.enum(FAILURE_CAUSES);
export type FailureCause = z.infer<typeof FailureCause>;

/** What the owner must fix outside the ticket; `reason_code` is the `admit()` denial that named the tool. */
export const SetupCause = z.discriminatedUnion('type', [
  z.object({ type: z.literal('login'), harness_id: HarnessId }),
  z.object({
    type: z.literal('tool'),
    tool: z.string().min(1),
    harness_kind: HarnessKind,
    version: z.string().min(1),
    reason_code: z.string().min(1),
  }),
  z.object({
    type: z.literal('harness_build'),
    harness_kind: HarnessKind,
    version: z.string().min(1),
  }),
]);
export type SetupCause = z.infer<typeof SetupCause>;

/** A question carries at most this many clickable options. */
export const MAX_OPTIONS = 4;

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

/** The payload of a new escalation row, told apart by `kind` (which mirrors the row kind). */
export const EscalationPayload = z.discriminatedUnion('kind', [
  EscalationQuestion,
  EscalationFailure,
  EscalationSetup,
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
  /** Engine only: a held ticket's lane went live and the hold lifted by itself; never offered as a button. */
  'pipeline_ready',
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

/** The reply of `POST /interactions/:id/act`: the escalation as it stands after the action. */
export const EscalationActReply = z.object({ escalation: EscalationView });
export type EscalationActReply = z.infer<typeof EscalationActReply>;

/** The reply of `POST /tickets/:id/act`: which ticket was acted on and with what (the waits it settles have no interaction to return). */
export const TicketActReply = z.object({ ticket_id: TicketId, action: EscalationAction });
export type TicketActReply = z.infer<typeof TicketActReply>;

const MIN_COMMENT = 5;
const comment = z.string().trim().min(MIN_COMMENT);

/** `POST /interactions/:id/act`: a closed union on `action`. */
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
  z.object({ action: z.literal('cancel'), cascade: z.boolean().optional() }),
  z.object({ action: z.literal('run_as_express') }),
  z.object({ action: z.literal('rework'), comment }),
  z.object({ action: z.literal('recheck') }),
  z.object({ action: z.literal('approve') }),
  z.object({
    action: z.literal('sign_off'),
    signer: z.string().trim().min(1).max(100).optional(),
  }),
]);
export type EscalationActBody = z.infer<typeof EscalationActBody>;
