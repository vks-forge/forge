/**
 * Lane pre-check input and result shapes.
 *
 * Why: the deterministic pre-check (director-core.md §6 step 1) takes cheap signals and returns a lane with reasons; the types are shared with the Director engine that calls it.
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
