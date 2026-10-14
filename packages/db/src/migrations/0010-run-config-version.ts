/**
 * Migration 0010: the settings version a run started under.
 *
 * Why: settings change while the factory runs (d-0085), so "what limits did this run have"
 *   cannot be answered from today's config. Each run row records `c<company>:p<project>`,
 *   the versions of the two override chains in force when the run was created, next to the
 *   catalogue hash that pins its tool policy. Together they let a reviewer replay a run
 *   under the exact rules it had. Existing rows stay NULL: their settings came from files.
 *
 * Exports: MIGRATION_0010.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0010: Migration = {
  id: 10,
  name: 'run-config-version',
  sql: `
ALTER TABLE runs ADD COLUMN config_version TEXT;
`,
};
