/**
 * In-memory ConfigSource: the test double and reference for the SQLite one.
 *
 * Why: the engine and server tests need settings that change mid-test without a database,
 *   and the contract (compare-and-swap versions, append-only history, built-ins at version
 *   0 on a fresh store) must hold for the fake exactly as for SQLite, or tests would pass
 *   against behaviour production does not have. Nothing persists.
 *
 * Exports: createMemoryConfigSource().
 * Depends on: @forge/core, shared/config-views. No IO.
 */

import { ConfigVersionConflictError } from '@forge/core';
import type { Clock, ConfigScope, ConfigSource, ConfigVersion } from '@forge/core';
import {
  checkScope,
  companyView,
  parseAppend,
  projectView,
} from '#/shared/config-views.js';

export function createMemoryConfigSource(clock: Pick<Clock, 'now'> = Date): ConfigSource {
  const rows: ConfigVersion[] = [];
  let nextId = 1;

  const chain = (scope: ConfigScope, project: string | null): ConfigVersion[] =>
    rows.filter((r) => r.scope === scope && r.project === project);

  const latest = (scope: ConfigScope, project: string | null): ConfigVersion | null =>
    chain(scope, project).at(-1) ?? null;

  const companyDoc = () => {
    const row = latest('company', null);

    return { doc: row?.scope === 'company' ? row.doc : null, version: row?.version ?? 0 };
  };

  return {
    company: async () => {
      const { doc, version } = companyDoc();

      return companyView(doc, version);
    },

    project: async (slug) => {
      checkScope('project', slug);
      const row = latest('project', slug);

      return projectView(companyDoc(), {
        doc: row?.scope === 'project' ? row.doc : null,
        version: row?.version ?? 0,
      });
    },

    history: async (scope, project) => {
      checkScope(scope, project);

      return structuredClone(chain(scope, project ?? null));
    },

    append: async (input) => {
      const req = parseAppend(input);
      const project = req.scope === 'project' ? req.project : null;
      const current = latest(req.scope, project)?.version ?? 0;
      if (current !== req.expectedVersion) {
        throw new ConfigVersionConflictError(req.expectedVersion, current);
      }

      const common = {
        id: nextId++,
        version: current + 1,
        author: req.author,
        reason: req.reason,
        created_at: clock.now(),
      };

      const saved: ConfigVersion =
        req.scope === 'company'
          ? { ...common, scope: 'company', project: null, doc: structuredClone(req.doc) }
          : {
              ...common,
              scope: 'project',
              project: req.project,
              doc: structuredClone(req.doc),
            };

      rows.push(saved);

      return structuredClone(saved);
    },
  };
}
