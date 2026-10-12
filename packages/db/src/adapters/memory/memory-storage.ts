/**
 * In-memory StorageAdapter: Maps behind the same port, with snapshot/rollback transactions.
 *
 * Why: a second implementation proves the StorageAdapter seam (m0-brief.md Slice 1
 *   exit, code.md rule 2). It mirrors sqlite's observable behaviour (duplicate keys
 *   throw, CAS by status_version, intake dedupe on (source, dedupe_key), event order by
 *   seq) and is validated by the same contract test. Rows are parsed with the core zod
 *   schemas on the way in, so bad data fails here exactly as it does on sqlite.
 *
 * Exports: createMemoryStorage().
 * Depends on: @forge/core, shared/mutex, shared/patches. No IO.
 */

import {
  IntakeEvent,
  Interaction,
  Run,
  RunEvent,
  Ticket,
  UnknownForgeError,
} from '@forge/core';
import type { StorageAdapter, StorageTx } from '@forge/core';
import type { MemoryState } from '#/types/memory-state.types.js';
import { createMutex } from '#/shared/mutex.js';
import {
  parseInteractionPatch,
  parseRunPatch,
  parseTicketPatch,
} from '#/shared/patches.js';

const emptyState = (): MemoryState => ({
  tickets: new Map(),
  runs: new Map(),
  events: new Map(),
  intake: new Set(),
  interactions: new Map(),
});

function insertUnique<T>(map: Map<string, T>, id: string, value: T, what: string): void {
  if (map.has(id)) throw new UnknownForgeError(`Duplicate ${what}: ${id}`);
  map.set(id, value);
}

function buildTx(state: MemoryState): StorageTx {
  return {
    tickets: {
      async get(id) {
        const t = state.tickets.get(id);
        return t ? structuredClone(t) : null;
      },
      async listByStatus(status) {
        return [...state.tickets.values()]
          .filter((t) => t.status === status)
          .map((t) => structuredClone(t));
      },
      async insert(ticket) {
        const t = Ticket.parse(ticket);
        insertUnique(state.tickets, t.id, t, 'ticket');
      },
      async updateTicketCas(id, expectedVersion, patch) {
        const current = state.tickets.get(id);
        if (!current || current.status_version !== expectedVersion) return false;
        const next = Ticket.parse({
          ...current,
          ...parseTicketPatch(expectedVersion, patch),
        });
        state.tickets.set(id, next);
        return true;
      },
    },

    runs: {
      async get(id) {
        const r = state.runs.get(id);
        return r ? structuredClone(r) : null;
      },
      async listByTicket(ticketId) {
        return [...state.runs.values()]
          .filter((r) => r.ticket_id === ticketId)
          .map((r) => structuredClone(r));
      },
      async insert(run) {
        const r = Run.parse(run);
        insertUnique(state.runs, r.id, r, 'run');
      },
      async update(id, patch) {
        const current = state.runs.get(id);
        if (!current) throw new UnknownForgeError(`Run not found: ${id}`);
        state.runs.set(id, Run.parse({ ...current, ...parseRunPatch(patch) }));
      },
    },

    runEvents: {
      async append(runId, event) {
        const e = RunEvent.parse(event);
        const log = state.events.get(runId) ?? new Map<number, RunEvent>();
        if (log.has(e.seq))
          throw new UnknownForgeError(`Duplicate seq ${e.seq} for ${runId}`);
        log.set(e.seq, e);
        state.events.set(runId, log);
      },
      async listByRun(runId, afterSeq) {
        const log = state.events.get(runId);
        if (!log) return [];
        return [...log.values()]
          .filter((e) => e.seq > (afterSeq ?? -1))
          .sort((a, b) => a.seq - b.seq)
          .map((e) => structuredClone(e));
      },
    },

    intakeEvents: {
      async insertIfNew(event) {
        const e = IntakeEvent.parse(event);
        const key = JSON.stringify([e.source, e.dedupe_key]);
        if (state.intake.has(key)) return false;
        state.intake.add(key);
        return true;
      },
    },

    interactions: {
      async get(id) {
        const i = state.interactions.get(id);
        return i ? structuredClone(i) : null;
      },
      async listPending() {
        return [...state.interactions.values()]
          .filter((i) => i.status === 'pending')
          .sort((a, b) => a.asked_at.localeCompare(b.asked_at))
          .map((i) => structuredClone(i));
      },
      async insert(interaction) {
        const i = Interaction.parse(interaction);
        insertUnique(state.interactions, i.id, i, 'interaction');
      },
      async update(id, patch) {
        const current = state.interactions.get(id);
        if (!current) throw new UnknownForgeError(`Interaction not found: ${id}`);
        state.interactions.set(
          id,
          Interaction.parse({ ...current, ...parseInteractionPatch(patch) }),
        );
      },
    },
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
          throw error;
        }
      }),
    close: () => mutex.run(async () => undefined),
  };
}
