/**
 * Input of the scorecard computation.
 *
 * Why: scorecards are computed on read from rows Forge already keeps (tickets, their pipeline snapshots,
 *   stage rows, runs and the owner's finding marks), never stored. The computation stays a pure function by
 *   taking those rows as plain values, so the HTTP route, the planning step and the substitute step read the
 *   same numbers from the same arithmetic.
 *
 * Exports: ScorecardTicket, ScorecardSnapshot, ScorecardInput.
 * Depends on: schemas/run, schemas/scorecard, schemas/stage-run, schemas/ticket, types/pipeline-rules. Types only.
 */

import type { Run } from '#/schemas/run.js';
import type { FindingMark, ScorecardRange } from '#/schemas/scorecard.js';
import type { StageRun, TicketPipeline } from '#/schemas/stage-run.js';
import type { Ticket } from '#/schemas/ticket.js';
import type { RosterEntry } from '#/types/pipeline-rules.types.js';

/** The part of a ticket a scorecard reads. */
export type ScorecardTicket = Pick<
  Ticket,
  | 'id'
  | 'type'
  | 'lane'
  | 'tier_predicted'
  | 'tier_actual'
  | 'status'
  | 'rework_count'
  | 'created_at'
  | 'updated_at'
> &
  Partial<Pick<Ticket, 'card_id'>>;

/** The part of a ticket's pipeline snapshot a scorecard reads. */
export type ScorecardSnapshot = Pick<
  TicketPipeline,
  'ticket_id' | 'lane' | 'definition' | 'roles' | 'hash' | 'base_hash' | 'adjustments'
>;

export interface ScorecardInput {
  /** Epoch ms of the read; the window is the last 30 or 90 days up to it. */
  readonly now: number;
  readonly range: ScorecardRange;
  readonly tickets: readonly ScorecardTicket[];
  readonly snapshots: readonly ScorecardSnapshot[];
  readonly rows: readonly StageRun[];
  readonly runs: readonly Run[];
  readonly marks: readonly FindingMark[];
  /** The agents to report on (names and roles); an agent seen only in rows is added with its id as name. */
  readonly roster: readonly RosterEntry[];
}
