/**
 * Inputs of the plain-language wait line.
 *
 * Why: the line the board shows depends on the phase, who holds the Worker slot, the scheduler's
 *   structured reason and the owner's last answer. Naming that bundle keeps the text rule a
 *   pure function the engine and a test call the same way.
 *
 * Exports: SlotHolder, WaitTextFacts, Scheduler, Explained.
 * Depends on: @forge/core (TicketPhase, TicketStatus), types/pick-next. Types only.
 */

import type { TicketPhase, TicketStatus, TicketWait } from '@forge/core';
import type { WaitReason } from '#/types/pick-next.types.js';

/** A ticket occupying a Worker slot and what it is doing with it. */
export interface SlotHolder {
  readonly id: string;
  readonly project: string;
  readonly harness: string;
  readonly doing: 'working' | 'getting_ready' | 'being_briefed';
}

export interface WaitTextFacts {
  readonly phase: TicketPhase;
  readonly status: TicketStatus;
  readonly cardId?: string;
  readonly blockedReason?: string;
  /** The scheduler's reason, or a wake set for later (`backoff`). */
  readonly scheduler?: WaitReason | { readonly kind: 'backoff'; readonly until: number };
  /** Holders of the slot this ticket waits for. */
  readonly holders: readonly SlotHolder[];
  /** The owner's latest settled answer on this ticket (`replan`, `rework`, ...). */
  readonly settledAction?: string;
}

/** The scheduler's reason for a ticket, or a wake set for later. */
export type Scheduler = NonNullable<WaitTextFacts['scheduler']>;

/** One ticket's explanation: the board's `TicketWait` and the ticket page's short scheduler line. */
export interface Explained {
  readonly wait: TicketWait;
  /** The scheduler's own short line (`cap: per-project 1/1`); null when it holds nothing back. */
  readonly line: string | null;
}
