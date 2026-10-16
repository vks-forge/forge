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
 * Cards, their history, relations, the reply queue and the card type registry (seeded with the built-in types) live here too.
 *
 * Exports: createMemoryStorage().
 * Depends on: adapters/memory/*, shared/db-errors, shared/mutex, types/memory-state. No IO.
 */

import { BUILTIN_CARD_TYPES } from '@forge/core';
import type { StorageAdapter, StorageTx } from '@forge/core';
import {
  memoryCardEvents,
  memoryCardTypes,
  memoryCards,
} from '#/adapters/memory/cards.js';
import {
  memoryCardRelations,
  memoryCardReplyQueue,
} from '#/adapters/memory/card-flow.js';
import {
  memoryIntakeEvents,
  memoryInteractions,
} from '#/adapters/memory/interactions.js';
import { memoryInboxStates } from '#/adapters/memory/inbox-states.js';
import { memoryHarnessState } from '#/adapters/memory/harness-state.js';
import { memoryHarnesses } from '#/adapters/memory/harnesses.js';
import { memoryGithubConnections } from '#/adapters/memory/github-connections.js';
import {
  memoryHarnessToolSchemas,
  memoryHarnessVersions,
} from '#/adapters/memory/harness-compat.js';
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
  harnessState: new Map(),
  githubConnections: new Map(),
  harnessVersions: new Map(),
  harnessToolSchemas: new Map(),
  inboxStates: new Map(),
  cards: new Map(),
  cardEvents: new Map(),
  cardRelations: [],
  cardReplies: [],
  cardReplySeq: 0,
  // Same rows migration 0019 seeds, so a fresh memory store routes intake like a fresh database.
  cardTypes: new Map(BUILTIN_CARD_TYPES.map((t) => [t.name, structuredClone(t)])),
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
    harnessState: memoryHarnessState(state),
    githubConnections: memoryGithubConnections(state),
    harnessVersions: memoryHarnessVersions(state),
    harnessToolSchemas: memoryHarnessToolSchemas(state),
    inboxStates: memoryInboxStates(state),
    cards: memoryCards(state),
    cardEvents: memoryCardEvents(state),
    cardTypes: memoryCardTypes(state),
    cardRelations: memoryCardRelations(state),
    cardReplyQueue: memoryCardReplyQueue(state),
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
