/**
 * Card chat engine shapes.
 *
 * Why: the chat step reads one consistent view of the card (its type, project, tickets and
 *   recent history) and its actions re-check that view before writing, so the view is named
 *   once instead of re-derived by each action.
 *
 * Exports: ChatContext, ActionGate, ChatTurn, TicketEditAction.
 * Depends on: @forge/core (card, card type, project schemas). Types only.
 */

import type {
  ActionTaken,
  Card,
  CardChatAction,
  CardType,
  Project,
  Ticket,
} from '@forge/core';

/** What the `card_chat` step is given: the rows it was built from and the JSON input itself. */
export interface ChatContext {
  readonly card: Card;
  readonly type: CardType;
  readonly project: Project;
  readonly tickets: readonly Ticket[];
  readonly input: Record<string, unknown>;
}

/** What the turn being answered was triggered by: the owner's own words in its messages (empty when no person wrote). */
export interface ChatTurn {
  readonly ownerText: string;
}

/** Whether an action may run on this card: the card and its type, or the refusal already logged. */
export type ActionGate =
  | { readonly ok: true; readonly card: Card; readonly type: CardType }
  | { readonly ok: false; readonly taken: ActionTaken };

/** The chat actions that edit a ticket through the ticket edit door. */
export type TicketEditAction = Extract<
  CardChatAction,
  { kind: 'set_ticket_dependencies' | 'set_ticket_priority' | 'edit_ticket_description' }
>;
