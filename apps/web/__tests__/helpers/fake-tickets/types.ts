/**
 * Shapes used by the mock adapter's ticket fixtures.
 *
 * Why: the fixtures, the scripted run streams and the mock store share a few record shapes;
 *   keeping them here keeps the data files to data and the logic files to logic.
 *
 * Exports: SampleTicket, TicketSeed, FakeTicketHooks.
 * Depends on: @forge/core (types). Types only.
 */

import type {
  GateResult,
  Interaction,
  Lane,
  Run,
  Ticket,
  TicketStatus,
} from '@forge/core';

export interface SampleTicket {
  readonly ticket: Ticket;
  readonly runs: readonly Run[];
  readonly gates: readonly GateResult[];
  readonly interactions: readonly Interaction[];
  readonly waitReason: string | null;
}

export interface TicketSeed {
  readonly id: string;
  readonly project: string;
  readonly title: string;
  readonly status: TicketStatus;
  readonly lane: Lane;
  readonly updated: number;
  readonly rework?: number;
  readonly pr?: number;
  readonly blocked?: string;
  readonly run?: { id: string; status: Run['status']; harness?: string; cost?: number };
}

/** What the fake ticket store needs from the test that owns it. */
export interface FakeTicketHooks {
  readonly delay: (signal: AbortSignal | undefined) => Promise<void>;
  readonly fail: () => void;
  readonly streamDelayMs: number;
  readonly empty: boolean;
}
