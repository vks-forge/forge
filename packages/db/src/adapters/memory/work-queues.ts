/**
 * In-memory wake request, gate result and project repositories.
 *
 * Why: the engine tick reads these three to decide what to wake, what a ticket's
 *   verification state is and which repo it belongs to, and its tests run on this backend.
 *   They keep the SQLite rules: a duplicate wake (ticket, reason, key) coalesces into the
 *   stored row instead of queueing, gate results are read per ticket through the runs they
 *   judged (a result for an unknown run belongs to no ticket), and a project slug stays
 *   unique, so a rule the engine depends on cannot be missing from the test backend
 *   (director-core.md §3, verification-plane.md).
 *
 * Exports: memoryWakeRequests(), memoryGateResults(), memoryProjects().
 * Depends on: @forge/core, adapters/memory/project-purge, adapters/memory/rows, types/memory-state.types. No IO.
 */

import {
  GateResult,
  InvalidInputError,
  NewGateResult,
  NewWakeRequest,
  Project,
  WakeRequest,
} from '@forge/core';
import type {
  GateResultRepository,
  ProjectRepository,
  WakeRequestRepository,
} from '@forge/core';
import { purgeProjectState } from '#/adapters/memory/project-purge.js';
import { insertUnique } from '#/adapters/memory/rows.js';
import type { MemoryState } from '#/types/memory-state.types.js';

export function memoryWakeRequests(state: MemoryState): WakeRequestRepository {
  return {
    async insertIfNew(request) {
      const w = NewWakeRequest.parse(request);
      const existing = [...state.wakes.values()].find(
        (x) =>
          x.ticket_id === w.ticket_id &&
          x.reason === w.reason &&
          x.idempotency_key === w.idempotency_key,
      );

      if (existing) {
        existing.coalesced_count += 1;

        return { inserted: false, request: structuredClone(existing) };
      }

      const stored = WakeRequest.parse({ ...w, coalesced_count: 0, status: 'pending' });
      insertUnique(state.wakes, stored.id, stored, 'wake request');

      return { inserted: true, request: structuredClone(stored) };
    },
    async listDue(now) {
      return [...state.wakes.values()]
        .filter(
          (w) =>
            w.status === 'pending' && (w.not_before === undefined || w.not_before <= now),
        )
        .map((w) => structuredClone(w));
    },
    async markConsumed(id, at) {
      const w = state.wakes.get(id);
      if (w?.status !== 'pending') {
        return false;
      }

      w.status = 'consumed';
      w.consumed_at = at;

      return true;
    },
    async countSince(ticketId, since, kinds) {
      return [...state.wakes.values()].filter(
        (w) =>
          w.ticket_id === ticketId &&
          w.created_at >= since &&
          (kinds === undefined || kinds.includes(w.kind)),
      ).length;
    },
  };
}

export function memoryGateResults(state: MemoryState): GateResultRepository {
  return {
    async insert(result) {
      const stored = GateResult.parse({
        ...NewGateResult.parse(result),
        id: state.gateSeq + 1,
      });

      state.gateSeq = stored.id;
      state.gates.push(stored);

      return structuredClone(stored);
    },
    async listByTicket(ticketId) {
      const runIds = new Set(
        [...state.runs.values()].filter((r) => r.ticket_id === ticketId).map((r) => r.id),
      );

      return state.gates
        .filter((g) => runIds.has(g.run_id))
        .map((g) => structuredClone(g));
    },
  };
}

export function memoryProjects(state: MemoryState): ProjectRepository {
  return {
    async get(id) {
      const p = state.projects.get(id);

      return p ? structuredClone(p) : null;
    },
    async upsert(project) {
      const p = Project.parse(project);
      for (const other of state.projects.values()) {
        if (other.slug === p.slug && other.id !== p.id) {
          throw new InvalidInputError(`Duplicate project slug: ${p.slug}`);
        }
      }

      // Map.set on an existing key keeps its position, like the SQLite upsert keeps its rowid.
      state.projects.set(p.id, p);
    },
    async delete(id) {
      return state.projects.delete(id);
    },
    async purge(slug) {
      return purgeProjectState(state, slug);
    },
    async list() {
      return [...state.projects.values()].map((p) => structuredClone(p));
    },
  };
}
