/**
 * Shape of the in-memory adapter's state.
 *
 * Why: hand-written types live under types/ (code.md rule 10); the memory adapter
 *   snapshots and restores this whole object to roll a transaction back.
 *
 * Exports: MemoryState.
 * Depends on: @forge/core (types). Types only.
 */

import type { Interaction, Run, RunEvent, Ticket } from '@forge/core';

/** All rows held by `createMemoryStorage`, keyed by primary key. */
export interface MemoryState {
  tickets: Map<string, Ticket>;
  runs: Map<string, Run>;
  events: Map<string, Map<number, RunEvent>>;
  /** JSON of `[source, dedupe_key]` per stored intake event. */
  intake: Set<string>;
  interactions: Map<string, Interaction>;
}
