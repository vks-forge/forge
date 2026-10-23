/**
 * Card chat schemas — the message body, the Director's actions and its answer.
 *
 * Why: the user talks to a card's Director about the whole request (d-0109), and the
 *   Director may act on what it hears: file a ticket, steer a Worker, retype the card,
 *   suggest closing it, cancel a ticket (only when the owner asked), or edit a ticket's dependencies, priority and description. What the model returns is untrusted, so the reply and every action
 *   are one zod shape parsed at the boundary; an action with a missing field is a rejected
 *   step, never a half-run ticket. The same schema becomes the JSON Schema the model is held
 *   to. Actions are a closed union: the engine executes only these (file, steer, retype, suggest close, and edit a ticket's dependencies, priority or description), each through its
 *   existing door, and a card type's registry actions decide which of them it allows
 *   (domain/card-chat-actions). `ActionTaken` is the record of one action's outcome, shared
 *   by the history events and the `director_message` it rode with. `CardDirectorStatus` is
 *   what the Card page reads to show a typing or error state while a reply is pending.
 *
 * Exports: CARD_MESSAGE_MAX_CHARS, CardMessageBody, CHAT_ACTION_KINDS, ChatActionKind,
 *   CardChatAction, CardChatOutput, ActionTaken, CardDirectorStatus.
 * Depends on: schemas/card, schemas/ticket, schemas/ticket-edit, zod. No IO.
 */

import { z } from 'zod';
import { CardTypeName } from '#/schemas/card.js';
import { Lane } from '#/schemas/ticket.js';
import {
  TICKET_BODY_MAX_CHARS,
  TICKET_PRIORITY_MAX,
  TICKET_PRIORITY_MIN,
} from '#/schemas/ticket-edit.js';

export const CARD_MESSAGE_MAX_CHARS = 8000;

/** `POST /cards/:id/messages`: what the user says, and who they are. */
export const CardMessageBody = z.strictObject({
  text: z.string().min(1).max(CARD_MESSAGE_MAX_CHARS),
  author: z.string().min(1).max(200),
});
export type CardMessageBody = z.infer<typeof CardMessageBody>;

export const CHAT_ACTION_KINDS = [
  'create_ticket',
  'steer_run',
  'change_type',
  'suggest_close',
  'set_ticket_dependencies',
  'set_ticket_priority',
  'edit_ticket_description',
  'cancel_ticket',
] as const;
export const ChatActionKind = z.enum(CHAT_ACTION_KINDS);
export type ChatActionKind = z.infer<typeof ChatActionKind>;

/** One thing the Director asks the engine to do for the card; the engine decides whether it may. */
export const CardChatAction = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('create_ticket'),
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(CARD_MESSAGE_MAX_CHARS),
    lane: Lane.optional(),
    /** A cancelled ticket of this card whose work this one restores: the new ticket takes its priority. */
    restores: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('steer_run'),
    ticket_id: z.string().min(1),
    message: z.string().min(1).max(4000),
  }),
  z.object({ kind: z.literal('change_type'), type: CardTypeName }),
  z.object({ kind: z.literal('suggest_close'), reason: z.string().min(1).max(500) }),
  z.object({
    kind: z.literal('set_ticket_dependencies'),
    ticket_id: z.string().min(1),
    /** The complete set of ticket ids it waits for; an empty list clears its dependencies. */
    depends_on: z.array(z.string().min(1)).max(20),
  }),
  z.object({
    kind: z.literal('set_ticket_priority'),
    ticket_id: z.string().min(1),
    priority: z.number().int().min(TICKET_PRIORITY_MIN).max(TICKET_PRIORITY_MAX),
  }),
  z.object({
    kind: z.literal('edit_ticket_description'),
    ticket_id: z.string().min(1),
    body: z.string().min(1).max(TICKET_BODY_MAX_CHARS),
  }),
  z.object({
    kind: z.literal('cancel_ticket'),
    ticket_id: z.string().min(1),
    /** Why, in the owner's words; it is written on the ticket's history next to "the Director cancelled it". */
    reason: z.string().min(1).max(500),
    /** Also cancel every open ticket that waits on this one; without it a ticket others wait on is refused. */
    cascade: z.boolean().optional(),
  }),
]);
export type CardChatAction = z.infer<typeof CardChatAction>;

/** The `card_chat` step output: the reply the user reads and the actions to attempt, in order. */
export const CardChatOutput = z.object({
  reply: z.string().min(1).max(CARD_MESSAGE_MAX_CHARS),
  actions: z.array(CardChatAction).max(5),
});
export type CardChatOutput = z.infer<typeof CardChatOutput>;

/** What happened to one action: `done` ran through its door, `refused` did not and `summary` says why in plain words. */
export const ActionTaken = z.object({
  action: ChatActionKind,
  result: z.enum(['done', 'refused']),
  summary: z.string().min(1),
});
export type ActionTaken = z.infer<typeof ActionTaken>;

/** `director` on `GET /cards/:id`: `thinking` while a reply is pending, `error` after a failed one until the next message. */
export const CardDirectorStatus = z.object({
  state: z.enum(['idle', 'thinking', 'error']),
  last_error: z.string().optional(),
});
export type CardDirectorStatus = z.infer<typeof CardDirectorStatus>;
