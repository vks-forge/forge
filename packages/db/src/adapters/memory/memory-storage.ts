/**
 * In-memory StorageAdapter: Maps behind the same port, with snapshot/rollback transactions.
 *
 * Why: the Director depends on the StorageAdapter contract, not on SQLite. A second,
 *   in-memory implementation proves the contract is real: engine and gate tests run
 *   against it fast with no files, and any behaviour the engine accidentally relies on
 *   from SQLite surfaces as a contract failure. It mirrors sqlite's observable behaviour
 *   (duplicate keys throw, CAS on status_version, intake dedupe on (source, dedupe_key),
 *   events numbered and ordered by seq, token hashes only, rollback on a throw) and
 *   parses rows with the core schemas on the way in, so bad data fails here exactly as it
 *   would in production. Nothing persists, so it is not a production backend.
 *
 * Exports: createMemoryStorage().
 * Depends on: @forge/core, shared/db-errors, shared/mutex, shared/patches, shared/run-event,
 *   shared/run-token. No IO.
 */

import {
  IntakeEvent,
  Interaction,
  InvalidInputError,
  PolicyDeniedError,
  Run,
  RunEvent,
  Ticket,
  UnknownForgeError,
} from '@forge/core';
import type { StorageAdapter, StorageTx } from '@forge/core';
import type { MemoryState } from '#/types/memory-state.types.js';
import { mapDbError } from '#/shared/db-errors.js';
import { createMutex } from '#/shared/mutex.js';
import { normaliseRunEvent } from '#/shared/run-event.js';
import { parseTokenRecord } from '#/shared/run-token.js';
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
  tokens: new Map(),
});

function insertUnique<T>(map: Map<string, T>, id: string, value: T, what: string): void {
  if (map.has(id)) throw new InvalidInputError(`Duplicate ${what}: ${id}`);
  map.set(id, value);
}

// zod keeps present-but-undefined keys; SQLite has no such thing (a cleared column is
// NULL, which reads back as an absent key), so drop them to read back identically.
function withoutUndefined<T extends object>(row: T): T {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) as T;
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
        const next = withoutUndefined(
          Ticket.parse({ ...current, ...parseTicketPatch(expectedVersion, patch) }),
        );
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
        state.runs.set(
          id,
          withoutUndefined(Run.parse({ ...current, ...parseRunPatch(patch) })),
        );
      },
    },

    runEvents: {
      async append(runId, event) {
        const log = state.events.get(runId) ?? new Map<number, RunEvent>();
        // Storage is the single seq allocator; any seq the caller sent is overwritten.
        const e = RunEvent.parse({
          ...normaliseRunEvent(event),
          seq: Math.max(-1, ...log.keys()) + 1,
        });
        log.set(e.seq, e);
        state.events.set(runId, log);
        return structuredClone(e);
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

    runTokens: {
      async issue(runId, tokenSha256) {
        const t = parseTokenRecord(runId, tokenSha256);
        if (state.tokens.get(t.runId)?.revoked === true)
          throw new PolicyDeniedError(
            `run ${runId} token was revoked; use reissue to re-arm`,
          );
        state.tokens.set(t.runId, { sha256: t.tokenSha256, revoked: false });
      },
      async reissue(runId, tokenSha256) {
        const t = parseTokenRecord(runId, tokenSha256);
        state.tokens.set(t.runId, { sha256: t.tokenSha256, revoked: false });
      },
      put(runId, tokenSha256, issuedAt) {
        return this.issue(runId, tokenSha256, issuedAt);
      },
      async getHash(runId) {
        const t = state.tokens.get(runId);
        return t && !t.revoked ? t.sha256 : null;
      },
      async revoke(runId) {
        const t = state.tokens.get(runId);
        if (t) t.revoked = true;
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
          withoutUndefined(
            Interaction.parse({ ...current, ...parseInteractionPatch(patch) }),
          ),
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
          throw mapDbError(error);
        }
      }),
    close: () => mutex.run(async () => undefined),
  };
}
