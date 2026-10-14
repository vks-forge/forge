/**
 * In-memory HarnessRepository.
 *
 * Why: the engine and server tests need the same registry behaviour as SQLite (parse on
 *   the way in, upsert keeps list position, rows are copies) without a file, so the
 *   contract suite can prove both backends agree.
 *
 * Exports: memoryHarnesses().
 * Depends on: @forge/core, types/memory-state.types. No IO.
 */

import { Harness } from '@forge/core';
import type { HarnessRepository } from '@forge/core';
import type { MemoryState } from '#/types/memory-state.types.js';

export function memoryHarnesses(state: MemoryState): HarnessRepository {
  return {
    async get(id) {
      const h = state.harnesses.get(id);

      return h ? structuredClone(h) : null;
    },
    async upsert(harness) {
      // Map.set on an existing key keeps its position, like the SQLite upsert keeps its rowid.
      const h = Harness.parse(harness);
      state.harnesses.set(h.id, h);
    },
    async list() {
      return [...state.harnesses.values()].map((h) => structuredClone(h));
    },
  };
}
