/**
 * In-memory access log and import attempts for project memory.
 *
 * Why: engine and server tests run on this backend, so the access log must number rows by storage alone,
 *   list newest first, prune by count and age per project and keep zero-hit searches, and the import state
 *   must return the latest attempt and replace an attempt with the same number, exactly as SQLite does. All
 *   state lives in `MemoryState`, so a rolled-back transaction leaves nothing behind.
 *
 * Exports: memoryMemoryLog().
 * Depends on: @forge/core, types/memory-state.types. No IO.
 */

import { MemoryImportRecord } from '@forge/core';
import type { MemoryRepository } from '@forge/core';
import type { MemoryState } from '#/types/memory-state.types.js';

export function memoryMemoryLog(
  state: MemoryState,
): Pick<
  MemoryRepository,
  'appendAccess' | 'listAccess' | 'pruneAccess' | 'importState' | 'saveImport'
> {
  return {
    async appendAccess(project, row) {
      state.memoryAccessSeq += 1;
      state.memoryAccess.push({
        ...structuredClone(row),
        seq: state.memoryAccessSeq,
        project,
      });
    },

    async listAccess(project, limit) {
      return state.memoryAccess
        .filter((r) => r.project === project)
        .sort((a, b) => b.seq - a.seq)
        .slice(0, limit)
        .map(({ project: _project, ...r }) => {
          void _project;

          return structuredClone(r);
        });
    },

    async pruneAccess(project, keepRows, olderThan) {
      const mine = state.memoryAccess
        .filter((r) => r.project === project)
        .sort((a, b) => b.seq - a.seq);

      const keep = new Set(
        mine
          .slice(0, keepRows)
          .filter((r) => r.at >= olderThan)
          .map((r) => r.seq),
      );

      const before = state.memoryAccess.length;
      state.memoryAccess = state.memoryAccess.filter(
        (r) => r.project !== project || keep.has(r.seq),
      );

      return before - state.memoryAccess.length;
    },

    async importState(project) {
      const attempts = state.memoryImports.get(project) ?? [];
      const last = attempts[attempts.length - 1];

      return last ? structuredClone(last) : null;
    },

    async saveImport(project, record) {
      const r = MemoryImportRecord.parse(record);
      const rest = (state.memoryImports.get(project) ?? []).filter(
        (a) => a.attempt !== r.attempt,
      );

      state.memoryImports.set(
        project,
        [...rest, structuredClone(r)].sort((a, b) => a.attempt - b.attempt),
      );
    },
  };
}
