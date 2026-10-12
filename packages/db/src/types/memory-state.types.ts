/**
 * Shape of the in-memory adapter's state.
 *
 * Why: the in-memory adapter has to roll a transaction back the way sqlite does. Holding
 *   all of its tables in one state object lets it snapshot before the callback and
 *   restore on a throw, so engine failure-path tests see the same atomicity the SQLite
 *   adapter gives.
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
