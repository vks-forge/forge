/**
 * In-memory run, run-event and run-inbox repositories.
 *
 * Why: the engine's tests exercise run lifecycle, the append-only event log and the steering
 *   inbox against this backend, so each must keep SQLite's observable rules: events and
 *   inbox messages are numbered by storage alone (any caller `seq` is overwritten), a run
 *   with an end time is never reopened, and `listByStatus` is the reconcile scan in start
 *   order. A divergence would let a test rely on behaviour production does not have
 *   (execution-plane.md §8, director-core.md §3, §8).
 *
 * Exports: memoryRuns(), memoryRunEvents(), memoryRunInbox().
 * Depends on: @forge/core, adapters/memory/rows, shared/patches, shared/run-event,
 *   types/memory-state.types. No IO.
 */

import {
  NewRunInboxMessage,
  Run,
  RunEvent,
  RunInboxMessage,
  UnknownForgeError,
} from '@forge/core';
import type { RunEventRepository, RunInboxRepository, RunRepository } from '@forge/core';
import { insertUnique, withoutUndefined } from '#/adapters/memory/rows.js';
import {
  assertInterruptMove,
  assertNotReopened,
  parseRunPatch,
} from '#/shared/patches.js';
import { normaliseRunEvent } from '#/shared/run-event.js';
import type { MemoryState } from '#/types/memory-state.types.js';

export function memoryRuns(state: MemoryState): RunRepository {
  return {
    async get(id) {
      const r = state.runs.get(id);

      return r ? structuredClone(r) : null;
    },
    async listByTicket(ticketId) {
      return [...state.runs.values()]
        .filter((r) => r.ticket_id === ticketId)
        .map((r) => structuredClone(r));
    },
    async listByStatus(statuses) {
      return [...state.runs.values()]
        .filter((r) => statuses.includes(r.status))
        .map((r) => structuredClone(r));
    },
    async list(filter) {
      const statuses = filter.statuses ?? [];
      const { after } = filter;
      const inProject = (r: Run): boolean =>
        filter.project === undefined ||
        state.tickets.get(r.ticket_id)?.project === filter.project;

      return [...state.runs.values()]
        .filter(inProject)
        .filter((r) => statuses.length === 0 || statuses.includes(r.status))
        .filter((r) => filter.since === undefined || r.started_at >= filter.since)
        .filter(
          (r) =>
            !after ||
            r.started_at < after.started_at ||
            (r.started_at === after.started_at && r.id < after.id),
        )
        .sort((a, b) =>
          a.started_at === b.started_at
            ? Number(b.id > a.id) - Number(b.id < a.id)
            : Number(b.started_at > a.started_at) - Number(b.started_at < a.started_at),
        )
        .slice(0, filter.limit)
        .map((r) => structuredClone(r));
    },
    async costByTicket(ticketIds) {
      const wanted = new Set<string>(ticketIds);
      const spent: Record<string, number> = {};
      for (const r of state.runs.values()) {
        if (wanted.has(r.ticket_id) && r.cost_usd !== undefined) {
          spent[r.ticket_id] = (spent[r.ticket_id] ?? 0) + r.cost_usd;
        }
      }

      return spent;
    },
    async costByCard(cardIds) {
      const wanted = new Set<string>(cardIds);
      const spent: Record<string, number> = {};
      for (const r of state.runs.values()) {
        const card = state.tickets.get(r.ticket_id)?.card_id;
        if (card !== undefined && wanted.has(card) && r.cost_usd !== undefined) {
          spent[card] = (spent[card] ?? 0) + r.cost_usd;
        }
      }

      return spent;
    },
    async insert(run) {
      const r = Run.parse(run);
      insertUnique(state.runs, r.id, { ...r, generation: r.generation ?? 1 }, 'run');
    },
    async update(id, patch) {
      const current = state.runs.get(id);
      if (!current) {
        throw new UnknownForgeError(`Run not found: ${id}`);
      }

      const parsed = parseRunPatch(patch);
      assertNotReopened(id, current.ended_at !== undefined, parsed);
      assertInterruptMove(id, current.status, parsed);
      state.runs.set(id, withoutUndefined(Run.parse({ ...current, ...parsed })));
    },
  };
}

export function memoryRunEvents(state: MemoryState): RunEventRepository {
  return {
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
      if (!log) {
        return [];
      }

      return [...log.values()]
        .filter((e) => e.seq > (afterSeq ?? -1))
        .sort((a, b) => a.seq - b.seq)
        .map((e) => structuredClone(e));
    },
  };
}

export function memoryRunInbox(state: MemoryState): RunInboxRepository {
  return {
    async append(message) {
      // A caller-supplied seq or delivered_at is stripped by the parse; storage numbers it.
      const m = NewRunInboxMessage.parse(message);
      const queue = state.inbox.get(m.run_id) ?? [];
      const stored = RunInboxMessage.parse({ ...m, seq: queue.length });
      state.inbox.set(m.run_id, [...queue, stored]);

      return structuredClone(stored);
    },
    async listUndelivered(runId) {
      return (state.inbox.get(runId) ?? [])
        .filter((m) => m.delivered_at === undefined)
        .map((m) => structuredClone(m));
    },
    async markDelivered(runId, seq, at) {
      const msg = (state.inbox.get(runId) ?? []).find((m) => m.seq === seq);
      if (!msg || msg.delivered_at !== undefined) {
        return false;
      }

      msg.delivered_at = at;

      return true;
    },
  };
}
