/**
 * In-memory StorageAdapter: Maps behind the same port, with snapshot/rollback transactions.
 *
 * Why: the Director depends on the StorageAdapter contract, not on SQLite. A second,
 *   in-memory implementation proves the contract is real: engine and gate tests run
 *   against it fast with no files, and any behaviour the engine accidentally relies on
 *   from SQLite surfaces as a contract failure. It mirrors sqlite's observable behaviour
 *   (duplicate keys throw, CAS on status_version and on interactions, intake dedupe on
 *   (source, dedupe_key), events numbered and ordered by seq, token hashes only, relations
 *   as the one source of parent and blocker links, rollback on a throw) and parses rows
 *   with the core schemas on the way in, so bad data fails here exactly as it would in
 *   production. The repositories live one concept per file beside this one; this file only
 *   assembles them and owns the transaction. Nothing persists, so it is not a production
 *   backend.
 *
 * Exports: createMemoryStorage().
 * Depends on: adapters/memory/*, shared/db-errors, shared/mutex, types/memory-state. No IO.
 */

import type { StorageAdapter, StorageTx } from '@forge/core';
import {
  memoryIntakeEvents,
  memoryInteractions,
} from '#/adapters/memory/interactions.js';
import { memoryHarnesses } from '#/adapters/memory/harnesses.js';
import { memoryGithubConnections } from '#/adapters/memory/github-connections.js';
import { memoryRunTokens } from '#/adapters/memory/run-tokens.js';
import { memoryRunEvents, memoryRunInbox, memoryRuns } from '#/adapters/memory/runs.js';
import { memoryTicketRelations, memoryTickets } from '#/adapters/memory/tickets.js';
import {
  memoryGateResults,
  memoryProjects,
  memoryWakeRequests,
} from '#/adapters/memory/work-queues.js';
import { mapDbError } from '#/shared/db-errors.js';
import { createMutex } from '#/shared/mutex.js';
import type { MemoryState } from '#/types/memory-state.types.js';

const emptyState = (): MemoryState => ({
  tickets: new Map(),
  relations: [],
  runs: new Map(),
  events: new Map(),
  inbox: new Map(),
  intake: new Map(),
  intakeSeq: 0,
  interactions: new Map(),
  tokens: new Map(),
  wakes: new Map(),
  gates: [],
  gateSeq: 0,
  projects: new Map(),
  harnesses: new Map(),
  githubConnections: new Map(),
});

function buildTx(state: MemoryState): StorageTx {
  return {
    tickets: memoryTickets(state),
    ticketRelations: memoryTicketRelations(state),
    runs: memoryRuns(state),
    runEvents: memoryRunEvents(state),
    runInbox: memoryRunInbox(state),
    runTokens: memoryRunTokens(state),
    intakeEvents: memoryIntakeEvents(state),
    interactions: memoryInteractions(state),
    wakeRequests: memoryWakeRequests(state),
    gateResults: memoryGateResults(state),
    projects: memoryProjects(state),
    harnesses: memoryHarnesses(state),
    githubConnections: memoryGithubConnections(state),
  };
}

/** A fresh, empty in-memory store. Transactions are serialized and roll back on throw. */
export function createMemoryStorage(): StorageAdapter {
  const state = emptyState();
  const tx = buildTx(state);
  const mutex = createMutex();

  return {
    transaction: (fn) =>
      mutex.run(async () => {
        const snapshot = structuredClone(state);
        try {
          return await fn(tx);
        } catch (error) {
          // Repositories read through `state`, so assigning the snapshot restores them.
          Object.assign(state, snapshot);
          throw mapDbError(error);
        }
      }),
    close: () => mutex.run(async () => undefined),
  };
}
