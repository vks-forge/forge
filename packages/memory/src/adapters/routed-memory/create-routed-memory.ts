/**
 * Routed memory — each project is read and written through the database or its old git repository, never both.
 *
 * Why: moving memory into the database happens project by project, after a proof, and a project whose proof
 *   failed must keep working from its files (and stay writable) until it is retried. The server picks one
 *   backend per project from its import state; every call asks that choice again, so the moment an import is
 *   verified the project's next read and write go to the database, with no restart. A project is never half
 *   in each: the choice is one value per project and the two backends do not share a record. The one place
 *   that decides is `stateOf`, a function the server supplies from the import log and the folder on disk.
 *
 * Exports: createRoutedMemory().
 * Depends on: @forge/core, adapters/routed-memory/file-backed-index, types/routed-memory.
 */

import type { MemoryIndex, MemoryScope, MemorySource, ProjectMemory } from '@forge/core';
import { createFileBackedIndex } from '#/adapters/routed-memory/file-backed-index.js';
import type { RoutedMemory, RoutedMemoryDeps } from '#/types/routed-memory.types.js';

export function createRoutedMemory(deps: RoutedMemoryDeps): RoutedMemory {
  const fileIndex = createFileBackedIndex(deps.fileSource, deps.files);
  const inDatabase = async (project: string): Promise<boolean> =>
    (await deps.stateOf(project)) === 'db';

  const route = async <T>(
    project: string,
    fn: (m: ProjectMemory) => Promise<T>,
  ): Promise<T> => fn((await inDatabase(project)) ? deps.db : deps.files);

  const through = async <T>(
    project: string,
    fn: (i: MemoryIndex) => Promise<T>,
  ): Promise<T> => fn((await inDatabase(project)) ? deps.dbIndex : fileIndex);

  const memory: ProjectMemory = {
    init: (p) => route(p, (m) => m.init(p)),
    reader: {
      list: (p) => route(p, (m) => m.reader.list(p)),
      get: (p, id) => route(p, (m) => m.reader.get(p, id)),
    },
    writer: {
      propose: (p, i) => route(p, (m) => m.writer.propose(p, i)),
      decide: (p, i) => route(p, (m) => m.writer.decide(p, i)),
      approve: (p, id, by) => route(p, (m) => m.writer.approve(p, id, by)),
      reject: (p, id, reason, by) => route(p, (m) => m.writer.reject(p, id, reason, by)),
      supersede: (p, oldId, i) => route(p, (m) => m.writer.supersede(p, oldId, i)),
      appendOutcome: (p, text) => route(p, (m) => m.writer.appendOutcome(p, text)),
    },
  };

  const index: MemoryIndex = {
    search: (q) => through(q.project, (i) => i.search(q)),
    get: (p, ids, o) => through(p, (i) => i.get(p, ids, o)),
    related: (p, id, k, o) => through(p, (i) => i.related(p, id, k, o)),
    list: (p, s) => through(p, (i) => i.list(p, s)),
    digest: (p, s) => through(p, (i) => i.digest(p, s)),
    rejected: (p, l, s) => through(p, (i) => i.rejected(p, l, s)),
    pinned: (p, l, s) => through(p, (i) => i.pinned(p, l, s)),
    decisions: (p, s) => through(p, (i) => i.decisions(p, s)),
    history: (p, id) => through(p, (i) => i.history(p, id)),
  };

  const source: MemorySource = {
    async slice(project, filter) {
      if (!(await inDatabase(project))) {
        return deps.fileSource.slice(project, filter);
      }

      const scope: MemoryScope | undefined =
        filter === undefined
          ? undefined
          : {
              kinds: filter.include_rejected ? ['decision', 'rejected'] : ['decision'],
              status: filter.include_rejected ? ['active', 'rejected'] : ['active'],
              tags: [...filter.tags],
              include_rejected: filter.include_rejected,
            };

      return {
        decisions: await deps.dbIndex.decisions(project, scope),
        rejected: await deps.dbIndex.rejected(project, undefined, scope),
      };
    },
  };

  return { memory, index, source };
}
