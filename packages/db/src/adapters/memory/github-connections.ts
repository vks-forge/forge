/**
 * In-memory GithubConnectionRepository.
 *
 * Why: the server's projects API and the GitHub host builder read connections, and their
 *   tests run on this backend. It keeps the SQLite rules (upsert by id keeps the original
 *   `created_at` and the row's place in the list, rows are schema-validated on the way in,
 *   readers get copies) so a rule the server relies on cannot be missing from the test
 *   backend. No key bytes exist here: only the secret's name (d-0094).
 *
 * Exports: memoryGithubConnections().
 * Depends on: @forge/core, types/memory-state.types. No IO.
 */

import { GithubConnection } from '@forge/core';
import type { GithubConnectionRepository } from '@forge/core';
import type { MemoryState } from '#/types/memory-state.types.js';

export function memoryGithubConnections(state: MemoryState): GithubConnectionRepository {
  return {
    async get(id) {
      const c = state.githubConnections.get(id);

      return c ? structuredClone(c) : null;
    },
    async upsert(connection) {
      const c = GithubConnection.parse(connection);
      const existing = state.githubConnections.get(c.id);
      // Like the SQLite upsert, an update never rewrites when the row was created.
      state.githubConnections.set(
        c.id,
        existing ? { ...c, created_at: existing.created_at } : c,
      );
    },
    async insertIfAbsent(connection) {
      const c = GithubConnection.parse(connection);
      if (state.githubConnections.has(c.id)) {
        return false;
      }

      state.githubConnections.set(c.id, c);

      return true;
    },
    async delete(id) {
      return state.githubConnections.delete(id);
    },
    async list() {
      return [...state.githubConnections.values()].map((c) => structuredClone(c));
    },
  };
}
