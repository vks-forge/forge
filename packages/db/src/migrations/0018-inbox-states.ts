/**
 * Migration 0018: the person's read and archive marks on inbox items.
 *
 * Why: the Inbox lists things that need or inform the owner (questions, reviews, failed
 *   gates, quota waits), derived from tables Forge already has. What it cannot derive is what
 *   the owner did with them: which they read and which they archived. `inbox_states` stores
 *   exactly that, one row per (project, kind, item), with the item's `updated_at` at the time
 *   of each mark, so an item whose source changes afterwards shows as unread and unarchived
 *   again (d-0116). Marks are keyed by project so one project's archive never touches another's.
 *   The primary key starts with the project, so reading all marks of a project is indexed.
 *   Nothing else changes; no existing row is touched.
 *
 * Exports: MIGRATION_0018.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0018: Migration = {
  id: 18,
  name: 'inbox-states',
  sql: `
CREATE TABLE inbox_states (
  project                  TEXT NOT NULL,
  kind                     TEXT NOT NULL,
  item_id                  TEXT NOT NULL,
  read_at                  TEXT,
  read_item_updated_at     TEXT,
  archived_at              TEXT,
  archived_item_updated_at TEXT,
  PRIMARY KEY (project, kind, item_id)
);
`,
};
