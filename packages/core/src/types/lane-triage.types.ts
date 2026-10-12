/**
 * Lane pre-check input and result shapes.
 *
 * Why: the Director feeds the deterministic lane pre-check whatever signals exist before
 *   any LLM call (predicted paths, ticket body length, type, the project's tier-C globs,
 *   a lane already set by an earlier step) and needs a lane back with human-readable
 *   reasons. The reasons are what the control room shows to explain why a ticket was not
 *   Express (director-core.md §6, execution-plane.md §2).
 *
 * Exports: PreCheckInput, PreCheckResult.
 * Depends on: schemas/ticket. No IO (types only).
 */

import type { Lane, TicketType } from '#/schemas/ticket.js';

/** Signals available before any LLM step. */
export interface PreCheckInput {
  readonly touchedPaths?: readonly string[];
  readonly tierCGlobs: readonly string[];
  readonly bodyLength: number;
  readonly type: TicketType;
  // Lane already assigned by an earlier step; the result is never lower (one-way escalation).
  readonly currentLane?: Lane;
}

/** Resulting lane plus the human-readable reasons that raised it. */
export interface PreCheckResult {
  readonly lane: Lane;
  readonly reasons: string[];
}
