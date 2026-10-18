/**
 * Types of the agent fallback chain.
 *
 * Why: a stage's agent names where it runs and an ordered list of other places to try (d-0080, d-0153).
 *   The engine and the scheduler read the same chain, so each entry is a plain value: its slot (0 is the
 *   agent's own), the resolved harness and the model it asks for.
 *
 * Exports: ChainEntry, NextFallbackInput.
 * Depends on: schemas/agent. Types only.
 */

import type { ModelChoice } from '#/schemas/agent.js';

/** One place an agent can run: slot 0 is its own `runs_on`, 1 and up are its fallbacks in the owner's order. */
export interface ChainEntry {
  readonly slot: number;
  readonly harness: string;
  readonly model: ModelChoice;
}

export interface NextFallbackInput {
  readonly chain: readonly ChainEntry[];
  /** Slots already used in this attempt, the current one included. */
  readonly tried: readonly number[];
  /** Parked harnesses by id; a harness is parked while `until` (epoch ms) is ahead of `now`. */
  readonly paused: Readonly<Record<string, { readonly until: number }>>;
  readonly installed: (harness: string) => boolean;
  readonly now: number;
  /** True when an entry may be used (a critic must not land on the Worker's own family); absent allows all. */
  readonly familyGuard?: (entry: ChainEntry) => boolean;
}
