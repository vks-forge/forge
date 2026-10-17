/**
 * CardEvent schemas — the append-only history of a card.
 *
 * Why: a card is the record of an intake, so everything that happens to it must be readable
 *   in order on the Card page: what the user and the Director said, which tickets the
 *   triage made, how each moved, which questions opened and were answered, and who changed
 *   the type or closed it (d-0105, d-0112 logs every action with its actor). One closed
 *   union keyed by `kind`, each kind with its own payload, means the UI renders every entry
 *   without guessing and a writer cannot store a `ticket_state` event without the ticket it
 *   is about. `seq` is allocated by storage alone, as for run events, so two writers cannot
 *   collide and a page boundary is a stable cursor.
 *
 *   The card chat adds three entries: `director_message` carries the actions the Director took
 *   with its reply, `director_action` logs each executed action, and `close_suggested`
 *   records a suggestion to close that only the user can act on (d-0112). `budget_warning`
 *   records that spend crossed a fraction of the card's cap, once per threshold; it only
 *   informs the owner and never blocks anything (d-0143).
 *
 *   Planning adds the Director's work as events (d-0130, d-0132): a step starting and
 *   finishing (with the files it read and the config version it ran under, as evidence),
 *   each grill question and answer, the end of the grill, the plan being ready, approved or
 *   sent back with changes, and `needs_you` with the actions the owner may take.
 *
 *   Escalations add three entries (S4a): `escalation` when a ticket's wait reaches the owner,
 *   `escalation_settled` when it ends and who ended it (the owner, the Director's first look, or
 *   an automatic resume), and `replan_requested` when the owner sends the card back to the
 *   Director from a stuck ticket. The chat renders the live escalation, not the event payload, so
 *   it shows the settled state wherever the answer was given.
 *
 * Exports: CARD_EVENT_KINDS, CardEventKind, NEEDS_YOU_ACTIONS, NewCardEvent, CardEvent.
 * Depends on: schemas/card, schemas/card-chat, schemas/escalation, schemas/grill, schemas/ids, schemas/ticket, zod. No IO.
 */

import { z } from 'zod';
import { CardActor, CardTypeName } from '#/schemas/card.js';
import { ActionTaken } from '#/schemas/card-chat.js';
import {
  FilesRead,
  GrillAnswer,
  GrillDoneReason,
  GrillQuestion,
} from '#/schemas/grill.js';
import {
  EscalationAction,
  EscalationActor,
  EscalationKind,
} from '#/schemas/escalation.js';
import { CardId, TicketId } from '#/schemas/ids.js';
import { TicketStatus } from '#/schemas/ticket.js';

export const CARD_EVENT_KINDS = [
  'user_message',
  'director_message',
  'director_action',
  'close_suggested',
  'ticket_created',
  'ticket_state',
  'interaction_opened',
  'interaction_answered',
  'type_changed',
  'card_closed',
  'budget_warning',
  'note',
  'step_started',
  'step_finished',
  'grill_question',
  'grill_answer',
  'grill_done',
  'plan_ready',
  'plan_approved',
  'plan_changes_requested',
  'needs_you',
  'escalation',
  'escalation_settled',
  'replan_requested',
] as const;
export const CardEventKind = z.enum(CARD_EVENT_KINDS);
export type CardEventKind = z.infer<typeof CardEventKind>;

const event = <K extends CardEventKind, P extends z.ZodType>(kind: K, payload: P) =>
  z.object({
    kind: z.literal(kind),
    at: z.iso.datetime(),
    actor: CardActor,
    payload,
  });

const text = z.object({ text: z.string().min(1) });

/**
 * The owner is asked to act: why, and which actions the card offers (no dead end, d-0135).
 * `ticket_id` names the held ticket when the actions include `run_as_express`.
 */
export const NEEDS_YOU_ACTIONS = [
  'answer',
  'approve_plan',
  'request_changes',
  'start_planning',
  'run_as_express',
] as const;
const NeedsYouPayload = z
  .object({
    reason: z.string().min(1),
    actions: z.array(z.enum(NEEDS_YOU_ACTIONS)).min(1),
    ticket_id: TicketId.optional(),
  })
  .refine((p) => !p.actions.includes('run_as_express') || p.ticket_id !== undefined, {
    message: 'run_as_express needs the ticket it applies to',
  });

const ticket = z.object({ ticket_id: z.string().min(1) });

/** A card event before storage has numbered it. */
export const NewCardEvent = z.discriminatedUnion('kind', [
  event('user_message', text),
  event(
    'director_message',
    text.extend({ actions_taken: z.array(ActionTaken).optional() }),
  ),
  event('director_action', ActionTaken),
  event('close_suggested', z.object({ reason: z.string().min(1) })),
  event('ticket_created', ticket.extend({ title: z.string().min(1) })),
  event(
    'ticket_state',
    ticket.extend({
      from: TicketStatus,
      to: TicketStatus,
      reason: z.string().optional(),
    }),
  ),
  event(
    'interaction_opened',
    ticket.extend({ interaction_id: z.string().min(1), interaction_kind: z.string() }),
  ),
  event('interaction_answered', ticket.extend({ interaction_id: z.string().min(1) })),
  event('type_changed', z.object({ from: CardTypeName, to: CardTypeName })),
  event('card_closed', z.object({ reason: z.string().min(1) })),
  event(
    'budget_warning',
    z.object({
      threshold: z.number().positive(),
      spent_usd: z.number().nonnegative(),
      cap_usd: z.number().nonnegative(),
    }),
  ),
  event('note', text),
  event(
    'step_started',
    z.object({
      step_id: z.string().min(1),
      step_kind: z.string().min(1),
      label: z.string(),
    }),
  ),
  event(
    'step_finished',
    z.object({
      step_id: z.string().min(1),
      step_kind: z.string().min(1),
      label: z.string(),
      files_read: FilesRead,
      config_version: z.number().int().nonnegative(),
      summary: z.string(),
    }),
  ),
  event('grill_question', GrillQuestion),
  event('grill_answer', GrillAnswer),
  event(
    'grill_done',
    z.object({ reason: GrillDoneReason, assumptions: z.array(z.string()) }),
  ),
  event(
    'plan_ready',
    z.object({
      version: z.number().int().positive(),
      ticket_count: z.number().int().nonnegative(),
      auto_approve_eligible: z.boolean(),
    }),
  ),
  event(
    'plan_approved',
    z.object({
      version: z.number().int().positive(),
      by: z.enum(['director', 'owner']),
      ticket_ids: z.array(TicketId),
      /** The plan key of each ticket, parallel to `ticket_ids`; absent on events written before re-planning. */
      plan_keys: z.array(z.string().min(1)).optional(),
    }),
  ),
  event(
    'plan_changes_requested',
    z.object({ version: z.number().int().positive(), comment: z.string().min(1) }),
  ),
  event('needs_you', NeedsYouPayload),
  event(
    'escalation',
    z.object({
      interaction_id: z.string().min(1),
      ticket_id: TicketId,
      escalation_kind: EscalationKind,
      title: z.string().min(1),
    }),
  ),
  event(
    'escalation_settled',
    z.object({
      interaction_id: z.string().min(1),
      ticket_id: TicketId,
      action: EscalationAction,
      by: EscalationActor,
      note: z.string().optional(),
    }),
  ),
  event(
    'replan_requested',
    z.object({
      ticket_id: TicketId.optional(),
      comment: z.string().min(1),
      by: z.literal('owner'),
    }),
  ),
]);
export type NewCardEvent = z.infer<typeof NewCardEvent>;

/** A stored card event: the card it belongs to and its 0-based position in that card's history. */
export const CardEvent = z.intersection(
  NewCardEvent,
  z.object({ card_id: CardId, seq: z.number().int().nonnegative() }),
);
export type CardEvent = z.infer<typeof CardEvent>;
