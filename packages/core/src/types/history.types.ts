/**
 * Types for building a history: the facts handed in and the lookups the builder shares.
 *
 * Why: the history builder is pure, so everything it reads (card events, questions, runs, stage
 *   runs, wakes, gate results, runs of other tickets that held a Worker slot) arrives as one named
 *   bag. Naming the bag keeps the server's loaders and the tests building the same shape.
 *
 * Exports: TicketHistoryFacts, CardHistoryFacts, HistoryItem, HistoryCtx.
 * Depends on: schemas/card-event, schemas/gate-result, schemas/interaction, schemas/run,
 *   schemas/stage-run, schemas/wake-request, schemas/history. Types only.
 */

import type { CardEvent } from '#/schemas/card-event.js';
import type { GateResult } from '#/schemas/gate-result.js';
import type { HistoryEntry } from '#/schemas/history.js';
import type { Interaction } from '#/schemas/interaction.js';
import type { Run } from '#/schemas/run.js';
import type { StageRun } from '#/schemas/stage-run.js';
import type { WakeRequest } from '#/schemas/wake-request.js';

/** Everything stored about one ticket; `events` may hold the whole card's events (other tickets are ignored). */
export interface TicketHistoryFacts {
  readonly ticketId: string;
  readonly events: readonly CardEvent[];
  readonly interactions: readonly Interaction[];
  readonly runs: readonly Run[];
  readonly stageRuns: readonly StageRun[];
  readonly wakes: readonly WakeRequest[];
  readonly gates: readonly GateResult[];
  /** Runs of other tickets, to name who held the Worker slot this ticket waited for. */
  readonly otherRuns?: readonly Run[];
}

/** A card's events; the card's history is these, with each ticket event as one roll-up line. */
export interface CardHistoryFacts {
  readonly events: readonly CardEvent[];
}

/** An entry with its tie-break rank: of two entries at the same instant, the lower rank reads first. */
export interface HistoryItem {
  readonly entry: HistoryEntry;
  readonly rank: number;
}

/** The ticket facts the sub-builders share, and the items they add to. */
export interface HistoryCtx {
  readonly facts: TicketHistoryFacts;
  readonly out: HistoryItem[];
}
