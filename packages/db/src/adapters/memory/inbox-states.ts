/**
 * In-memory InboxStateRepository.
 *
 * Why: route and engine tests run on this backend, so the Inbox marks must behave as in
 *   SQLite: one row per (project, kind, item), replaced on upsert, parsed on the way in,
 *   returned as copies, and never visible across projects. A divergence would let the
 *   resurface tests pass against behaviour production does not have.
 *
 * Exports: memoryInboxStates().
 * Depends on: @forge/core, types/memory-state.types. No IO.
 */

import { InboxStateRow } from '@forge/core';
import type { InboxStateRepository } from '@forge/core';
import type { MemoryState } from '#/types/memory-state.types.js';

const key = (project: string, kind: string, itemId: string): string =>
  JSON.stringify([project, kind, itemId]);

export function memoryInboxStates(state: MemoryState): InboxStateRepository {
  return {
    async get(project, kind, itemId) {
      const row = state.inboxStates.get(key(project, kind, itemId));

      return row ? structuredClone(row) : null;
    },
    async listByProject(project) {
      return [...state.inboxStates.values()]
        .filter((r) => r.project === project)
        .map((r) => structuredClone(r));
    },
    async upsert(row) {
      const s = InboxStateRow.parse(row);
      state.inboxStates.set(key(s.project, s.kind, s.item_id), s);
    },
  };
}
