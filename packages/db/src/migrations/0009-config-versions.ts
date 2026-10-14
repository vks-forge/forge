/**
 * Migration 0009: versioned settings.
 *
 * Why: settings live in the database and change only through the UI (d-0085, d-0090).
 *   Every save is a new immutable row, so a run can name the exact config version it used
 *   and a bad change can be read back and reverted by saving the old document again.
 *   `version` counts per scope and project from 1, and the unique index is what makes two
 *   concurrent saves of the same version impossible even across processes. Triggers refuse
 *   UPDATE and DELETE so no code path can rewrite history. `project` is NULL for the
 *   company scope, so the index folds NULL to '' (SQLite treats NULLs as distinct).
 *
 * Exports: MIGRATION_0009.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0009: Migration = {
  id: 9,
  name: 'config-versions',
  sql: `
CREATE TABLE config_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL CHECK (scope IN ('company', 'project')),
  project TEXT,
  version INTEGER NOT NULL CHECK (version >= 1),
  doc_json TEXT NOT NULL,
  author TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK ((scope = 'company' AND project IS NULL) OR (scope = 'project' AND project IS NOT NULL))
);

CREATE UNIQUE INDEX idx_config_versions_scope_version
  ON config_versions (scope, COALESCE(project, ''), version);

CREATE TRIGGER config_versions_no_update BEFORE UPDATE ON config_versions
BEGIN
  SELECT RAISE(ABORT, 'config_versions rows are immutable');
END;

CREATE TRIGGER config_versions_no_delete BEFORE DELETE ON config_versions
BEGIN
  SELECT RAISE(ABORT, 'config_versions rows are immutable');
END;
`,
};
