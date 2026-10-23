/**
 * In-memory Director spend ledger.
 *
 * Why: engine and server tests run on this backend, so it must answer exactly like SQLite: rows are
 *   append-only, parsed with the core schema, handed out with ascending ids, listed oldest first
 *   within a project and a time window, and read back as copies so a caller cannot edit the ledger.
 *   State lives in `MemoryState`, so a rolled-back transaction leaves no row behind.
 *
 * Exports: memoryDirectorSpend().
 * Depends on: @forge/core, types/memory-state.types. No IO.
 */

import { DirectorSpend, NewDirectorSpend } from '@forge/core';
import type { DirectorSpendRepository } from '@forge/core';
import type { MemoryState } from '#/types/memory-state.types.js';

export function memoryDirectorSpend(state: MemoryState): DirectorSpendRepository {
  return {
    async append(input) {
      // An explicit `undefined` is dropped so the row reads back as SQLite returns it (no key).
      const row = NewDirectorSpend.parse(
        Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
      );

      state.directorSpendSeq += 1;
      const stored = DirectorSpend.parse({ ...row, id: state.directorSpendSeq });
      state.directorSpend.push(structuredClone(stored));

      return stored;
    },

    async listByProject(project, window = {}) {
      return structuredClone(
        state.directorSpend
          .filter(
            (d) =>
              d.project === project &&
              (window.from === undefined || d.at >= window.from) &&
              (window.to === undefined || d.at <= window.to),
          )
          .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id - b.id)),
      );
    },

    async totalByCard(cardId) {
      return state.directorSpend
        .filter((d) => d.card_id === cardId)
        .reduce((sum, d) => sum + d.usd, 0);
    },

    async totalByTicket(ticketIds) {
      const wanted = new Set(ticketIds);
      const out: Record<string, number> = {};

      for (const d of state.directorSpend) {
        if (d.ticket_id !== undefined && wanted.has(d.ticket_id)) {
          out[d.ticket_id] = (out[d.ticket_id] ?? 0) + d.usd;
        }
      }

      return out;
    },
  };
}
