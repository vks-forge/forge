/**
 * Shapes shared by the tick phases: ticket plans, wake requests, dispatch candidates.
 *
 * Why: the phases (intake, triage, settle, dispatch) all change tickets and wakes the same
 *   way, through one plan-and-apply door, and hand each other small records (which ticket
 *   to start and why). Naming those records here keeps each phase file about its own rule
 *   and keeps hand-written types in one place.
 *
 * Exports: EventSpec, TicketFields, TicketPlan, MoveResult, WakeInput, WakeOutcome,
 *   DispatchKind, Candidate, Capacity, StepReject.
 * Depends on: @forge/core (TicketEvent, Ticket, WakeKind, WakeRequest, StepError). Types only.
 */

import type { StepError, Ticket, TicketEvent, WakeKind, WakeRequest } from '@forge/core';

type WithoutAt<E> = E extends TicketEvent ? Omit<E, 'at' | 'expected_version'> : never;

/** A ticket event as the engine states it; `at` is stamped by the move. */
export type EventSpec = WithoutAt<TicketEvent>;

/** The non-status ticket columns a move may set after its events (status only moves via events). */
export interface TicketFields {
  title?: string;
  type?: Ticket['type'];
  branch?: string | undefined;
  worktree?: string | undefined;
  assignee_run_id?: string | undefined;
  blocked_reason?: string | undefined;
  pr_number?: number | undefined;
  pr_url?: string | undefined;
}

/** What to do to one ticket: events through `transition()` in order, then plain fields. */
export interface TicketPlan {
  readonly events: readonly EventSpec[];
  readonly fields?: TicketFields;
}

export type MoveResult =
  | { readonly ok: true; readonly ticket: Ticket }
  | { readonly ok: false; readonly reason: string };

export interface WakeInput {
  readonly ticketId: string;
  readonly kind: WakeKind;
  readonly reason: string;
  /** With `ticketId` and `reason`, makes the wake idempotent. */
  readonly key: string;
  /** Epoch ms; absent means due now. */
  readonly notBefore?: number;
}

export interface WakeOutcome {
  /** False when the wake coalesced into an existing one or was refused by the cap. */
  readonly created: boolean;
  /** True when the re-wake cap refused it: the caller parks the ticket. */
  readonly capped: boolean;
  readonly wake?: WakeRequest;
}

export type DispatchKind = 'new' | 'retry' | 'resume';

/** A ticket the dispatch phase will try to start, and the wake behind it if any. */
export interface Candidate {
  readonly ticket: Ticket;
  readonly kind: DispatchKind;
  readonly wake?: WakeRequest;
}

/** Free run slots and the in_progress headroom, decremented as the phase starts runs. */
export interface Capacity {
  free: number;
  inProgress: number;
  readonly inProgressLimit: number;
}

/** Why a Director step produced nothing; the engine logs it and holds the step off. */
export interface StepReject {
  readonly error: StepError;
}
