/**
 * SQLite ConfigSource: versioned settings in `config_versions`.
 *
 * Why: the engine reads its limits through this on every tick and the server writes them
 *   when the user saves Settings, from different processes on one database file. Saving
 *   is read-current-version, compare, insert inside one `BEGIN IMMEDIATE` on the shared
 *   writer mutex, so two saves from the same stale screen cannot both win: the second
 *   gets `ConfigVersionConflictError` and the UI reloads. Rows are only ever inserted
 *   (triggers refuse update and delete), so a run's recorded version always reads back
 *   the same document. Reads never write: a fresh install answers with the built-in
 *   defaults at version 0.
 *
 * Exports: createSqliteConfigSource().
 * Depends on: @forge/core, adapters/sqlite/immediate-tx, shared/config-views,
 *   shared/db-errors, types/mutex.types, types/storage-driver.types.
 */

import {
  ConfigVersion,
  ConfigVersionConflictError,
  legacyProjectDocWarnings,
} from '@forge/core';
import type { Clock, ConfigScope, ConfigSource } from '@forge/core';
import { runImmediate } from '#/adapters/sqlite/immediate-tx.js';
import {
  checkScope,
  companyView,
  parseAppend,
  projectView,
} from '#/shared/config-views.js';
import { mapDbError, parseStored } from '#/shared/db-errors.js';
import type { Mutex } from '#/types/mutex.types.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const COLUMNS = 'id, scope, project, version, doc_json, author, reason, created_at';

function toVersion(row: SqlRow): ConfigVersion {
  return parseStored(
    ConfigVersion,
    { ...row, doc: JSON.parse(String(row['doc_json'])) as unknown },
    'config version',
  );
}

const companyDoc = (row: ConfigVersion | null) =>
  row?.scope === 'company' ? row.doc : null;

/** Config source over `driver`; `mutex` must be the one the storage on this connection uses. */
export function createSqliteConfigSource(
  driver: SqlDriver,
  mutex: Mutex,
  clock: Pick<Clock, 'now'> = Date,
): ConfigSource {
  const latest = (scope: ConfigScope, project: string | null): ConfigVersion | null => {
    const row = driver.get(
      `SELECT ${COLUMNS} FROM config_versions
       WHERE scope = ? AND COALESCE(project, '') = ? ORDER BY version DESC LIMIT 1`,
      [scope, project ?? ''],
    );

    return row ? toVersion(row) : null;
  };

  // The stored JSON of the latest project version, before the schema converted it: the
  // conversion of an old-format document drops some things, and only the raw text knows which.
  const legacyWarnings = (slug: string): string[] => {
    const row = driver.get(
      `SELECT doc_json FROM config_versions
       WHERE scope = 'project' AND project = ? ORDER BY version DESC LIMIT 1`,
      [slug],
    );

    return row ? legacyProjectDocWarnings(JSON.parse(String(row['doc_json']))) : [];
  };

  const read = <T>(body: () => T): Promise<T> =>
    mutex.run(async () => {
      try {
        return body();
      } catch (error) {
        throw mapDbError(error);
      }
    });

  return {
    company: () =>
      read(() => {
        const row = latest('company', null);

        return companyView(companyDoc(row), row?.version ?? 0);
      }),

    project: (slug) =>
      read(() => {
        checkScope('project', slug);
        const company = latest('company', null);
        const project = latest('project', slug);

        return projectView(
          { doc: companyDoc(company), version: company?.version ?? 0 },
          {
            doc: project?.scope === 'project' ? project.doc : null,
            version: project?.version ?? 0,
            warnings: legacyWarnings(slug),
          },
        );
      }),

    history: (scope, project) =>
      read(() => {
        checkScope(scope, project);

        return driver
          .all(
            `SELECT ${COLUMNS} FROM config_versions
             WHERE scope = ? AND COALESCE(project, '') = ? ORDER BY version`,
            [scope, project ?? ''],
          )
          .map(toVersion);
      }),

    append: async (input) => {
      const req = parseAppend(input);
      const project = req.scope === 'project' ? req.project : null;

      return mutex.run(() =>
        runImmediate(driver, async () => {
          const current = latest(req.scope, project)?.version ?? 0;
          if (current !== req.expectedVersion) {
            throw new ConfigVersionConflictError(req.expectedVersion, current);
          }

          driver.run(
            `INSERT INTO config_versions (scope, project, version, doc_json, author, reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              req.scope,
              project,
              current + 1,
              JSON.stringify(req.doc),
              req.author,
              req.reason,
              clock.now(),
            ],
          );

          const saved = latest(req.scope, project);
          if (!saved) {
            throw new Error('config version vanished after insert');
          }

          return saved;
        }),
      );
    },
  };
}
