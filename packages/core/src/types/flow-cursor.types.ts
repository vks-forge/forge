/**
 * Flow cursor context: what a step's `when` condition is decided with.
 *
 * Why: whether a planning step runs depends on the card (its predicted lane) and on the
 *   Director's own answer for steps it decides itself. Naming those two facts keeps the pure
 *   cursor function and its callers (the engine's flow runner, tests) on one contract, and lets
 *   an undecided fact be stated as null or absent so the step runs (doubt costs process, not safety).
 *
 * Exports: FlowContext.
 * Depends on: schemas/ticket. Types only.
 */

import type { Lane } from '#/schemas/ticket.js';

/** What the conditions are decided with. */
export interface FlowContext {
  /** The card's predicted lane, or null before one exists. */
  readonly lane: Lane | null;
  /** The Director's answers for `director_decides` steps, by step id. */
  readonly decisions: Readonly<Record<string, boolean>>;
}
