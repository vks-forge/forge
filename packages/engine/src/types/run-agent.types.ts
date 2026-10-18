/**
 * Types for the agent a run is started with.
 *
 * Why: dispatch, the scheduler, the quota path and a restart resume all need the same few
 *   facts about the agent behind a ticket's next run: which one it is, the hash of its
 *   effective definition, which harness and model it asks for and which harnesses replace the
 *   company fallback list. Resolving them once per tick and passing one value keeps the run
 *   request, the run row and the scheduler's harness choice from disagreeing.
 *
 * Exports: ResolvedAgent.
 * Depends on: @forge/core (AgentDefinition, ModelChoice). Types only.
 */

import type { AgentDefinition, ModelChoice } from '@forge/core';

/** An agent resolved against one tick's settings for one ticket's project and lane. */
export interface ResolvedAgent {
  readonly id: string;
  /** sha256 of the effective definition; recorded on the run row. */
  readonly hash: string;
  readonly definition: AgentDefinition;
  /** The harness the agent asks for, `project_default` already resolved. */
  readonly harnessId: string;
  /** What the agent asks for on its own harness; `forge_default` and `harness_default` are resolved by `modelFor`. */
  readonly modelChoice: ModelChoice;
  /** Harnesses to try, in order, instead of the company list; empty means the company list applies. */
  readonly fallbackHarnesses: readonly string[];
  /**
   * Which entry of the agent's `[primary, ...fallbacks]` chain this run uses: absent or 0 is its own `runs_on`,
   * above 0 a fallback entry (the harness and model above already are that entry's), -1 a substitute the Director
   * picked for a failed agent. Recorded on the run row.
   */
  readonly slot?: number | undefined;
}
