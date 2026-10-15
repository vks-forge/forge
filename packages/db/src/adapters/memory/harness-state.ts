/**
 * In-memory HarnessStateRepository.
 *
 * Why: engine and server tests need the same pause behaviour as SQLite (parse on the way
 *   in, replace by harness id, list ordered by id, rows are copies) without a file, so the
 *   contract suite can prove both backends agree on what a parked harness looks like.
 *
 * Exports: memoryHarnessState().
 * Depends on: @forge/core, types/memory-state.types. No IO.
 */

import { HarnessState } from '@forge/core';
import type { HarnessStateRepository } from '@forge/core';
import type { MemoryState } from '#/types/memory-state.types.js';

export function memoryHarnessState(state: MemoryState): HarnessStateRepository {
  return {
    async get(harnessId) {
      const s = state.harnessState.get(harnessId);

      return s ? structuredClone(s) : null;
    },
    async upsert(row) {
      const s = HarnessState.parse(row);
      state.harnessState.set(s.harness_id, s);
    },
    async clear(harnessId) {
      return state.harnessState.delete(harnessId);
    },
    async list() {
      return [...state.harnessState.values()]
        .sort((a, b) => (a.harness_id < b.harness_id ? -1 : 1))
        .map((s) => structuredClone(s));
    },
  };
}
