/**
 * Types of the escalation doors: the owner's actions on a waiting ticket and what each answers.
 *
 * Why: the owner acts on a waiting ticket from three screens through two routes (an escalation
 *   by interaction id, a ticket's own wait by ticket id). Each door answers with a closed set of
 *   outcomes, never a thrown string, so a route maps every outcome to one status and code (409
 *   `not_pending`, `action_not_offered`, `ticket_has_dependents`, `still_broken`, `stale`) and a
 *   late click or a second tab is a normal answer, not a crash. The Director's own first look
 *   shares the sweep state and the settle shape, so those are named here too.
 *
 * Exports: RaisedPayload, AnswerGuard, AnswerVerdict, EffectEnd, ActOutcome, EscalationDoors.
 * Depends on: @forge/core (escalation schemas, interaction, ticket types). Types only.
 */

import type {
  ApprovalMode,
  EscalationActBody,
  EscalationPayload,
  EscalationSettled,
  Interaction,
  TicketId,
} from '@forge/core';

/** The payloads the engine raises itself; a question comes from a Worker's own tool. */
export type RaisedPayload = Exclude<EscalationPayload, { kind: 'question' }>;

/** The owner's side of the answer decision: the confidence bar, whether the ticket is Tier C, and the approval mode. */
export interface AnswerGuard {
  readonly threshold: number;
  readonly tierC: boolean;
  readonly approvalMode: ApprovalMode;
}

/** The Director answers with `text`, or hands the question over with `note` (in words, for the owner). */
export type AnswerVerdict =
  | { readonly answer: true; readonly text: string }
  | { readonly answer: false; readonly note: string };

/** How an effect on a waiting ticket ended; `stale` means the ticket or card is no longer where the action needs it. */
export type EffectEnd = 'done' | 'not_pending' | 'stale';

/**
 * What an action did. `done` carries the settled interaction (null for a ticket-level action with
 * no interaction behind it). `not_pending` and `stale` are 409s: someone else settled it, or the
 * ticket moved. `invalid_answer` is a 400 (an option the question does not have).
 */
export type ActOutcome =
  | { readonly status: 'done'; readonly interaction: Interaction | null }
  | { readonly status: 'not_found' }
  | { readonly status: 'not_pending'; readonly settled?: EscalationSettled }
  | { readonly status: 'action_not_offered' }
  | { readonly status: 'invalid_answer'; readonly reason: string }
  | { readonly status: 'ticket_has_dependents'; readonly dependents: TicketId[] }
  | { readonly status: 'still_broken'; readonly detail: string }
  | { readonly status: 'stale' };

/** The engine doors of escalations: what `POST /interactions/:id/act` and `POST /tickets/:id/act` call. */
export interface EscalationDoors {
  /**
   * Settles one pending escalation with the owner's action. Refuses an action the escalation does
   * not offer (`action_not_offered`), one that is no longer pending (`not_pending`), and a cancel
   * that would strand dependent tickets (`ticket_has_dependents`, unless `cascade`).
   */
  actOnEscalation(
    interactionId: string,
    body: EscalationActBody,
    author: string,
  ): Promise<ActOutcome>;
  /**
   * The owner's action on a ticket's own wait, where no escalation is behind it: Rework on
   * finished work and Cancel on anything open. Anything else is `action_not_offered`.
   */
  actOnTicket(
    ticketId: string,
    body: EscalationActBody,
    author: string,
  ): Promise<ActOutcome>;
}
