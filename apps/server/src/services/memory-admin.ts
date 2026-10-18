/**
 * The memory admin port: import status and retry, markdown export, and the access log, for the memory routes.
 *
 * Why: the owner can see whether a project's memory has moved into the database (and why not, in plain words),
 *   retry the move, write memory out as markdown files for review, and read what searches asked of memory. The
 *   routes hold no logic of their own, so this is where those actions are made safe: an export goes under
 *   `<dataHome>/exports/memory-<slug>-<time>/` and nowhere else (never inside a project's repository or clone),
 *   and a project that is not on the database cannot be exported, because its files are the truth and an
 *   export of the half-empty database would mislead.
 *
 * Exports: createMemoryAdmin().
 * Depends on: node:path, node:fs/promises, @forge/core, @forge/memory, services/memory-migration,
 *   types/memory-admin. IO: reads the database, writes the export folder.
 */

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { InvalidInputError } from '@forge/core';
import { createMarkdownExporter, hasRepo, importStatusOf } from '@forge/memory';
import type { MemoryAdmin, MemoryAdminDeps } from '#/types/memory-admin.types.js';

const SLUG = /^[a-z][a-z0-9-]*$/;

export function createMemoryAdmin(deps: MemoryAdminDeps): MemoryAdmin {
  const exporter = createMarkdownExporter({ storage: deps.storage, now: deps.now });

  return {
    backend: deps.stateOf,

    async importStatus(slug) {
      const record = await deps.storage.transaction((tx) => tx.memory.importState(slug));
      if (
        record === null &&
        SLUG.test(slug) &&
        (await hasRepo(join(deps.memoryDir, slug)))
      ) {
        return {
          ...importStatusOf(null),
          state: 'pending',
          message: 'not moved into the database yet',
        };
      }

      return importStatusOf(record);
    },

    runImport: (slug) => deps.migration.migrate(slug),

    async exportTo(slug) {
      if (!SLUG.test(slug)) {
        throw new InvalidInputError(`invalid project slug ${JSON.stringify(slug)}`);
      }

      // Milliseconds in the name, and a counter if the same instant is asked for twice: an export never overwrites another.
      const stamp = deps.now().toISOString().replace(/[-:.]/g, '');
      let dir = join(deps.exportsDir, `memory-${slug}-${stamp}`);
      for (
        let n = 2;
        await stat(dir).then(
          () => true,
          () => false,
        );
        n += 1
      ) {
        dir = join(deps.exportsDir, `memory-${slug}-${stamp}-${n}`);
      }

      return exporter.exportTo(slug, dir);
    },

    accessLog: (slug, limit) =>
      deps.storage.transaction((tx) => tx.memory.listAccess(slug, limit)),
  };
}
