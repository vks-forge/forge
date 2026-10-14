/**
 * Migration 0011: many projects per install and GitHub connections.
 *
 * Why: one Forge install manages several repositories (d-0082, d-0094). A project now
 *   records where its clone lives on this machine (`local_path`, worktrees are cut from
 *   it), which GitHub connection and repository it belongs to, its lifecycle `status`
 *   (existing rows are `ready`, they already run tickets) and the ecosystems onboarding
 *   detected. Each run names its project so settle, steering and the UI can find the right
 *   project runtime without going through the ticket; existing runs are backfilled from
 *   their ticket. `github_connections` holds one GitHub App per org or account; the App's
 *   private key is never a column: `key_secret_name` points into the SecretStore.
 *   `projects.tier_c_globs_json` stays but is deprecated: settings own the paths since
 *   migration 0009, and nothing reads this column any more.
 *
 * Exports: MIGRATION_0011.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0011: Migration = {
  id: 11,
  name: 'many-projects',
  sql: `
ALTER TABLE projects ADD COLUMN local_path TEXT;
ALTER TABLE projects ADD COLUMN connection_id TEXT;
ALTER TABLE projects ADD COLUMN repo_full_name TEXT;
ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'ready'
  CHECK (status IN ('onboarding', 'ready', 'archived'));
ALTER TABLE projects ADD COLUMN ecosystems_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE runs ADD COLUMN project TEXT;
UPDATE runs SET project = (SELECT tickets.project FROM tickets WHERE tickets.id = runs.ticket_id);

CREATE TABLE github_connections (
  id              TEXT PRIMARY KEY,
  account         TEXT NOT NULL,
  app_id          TEXT NOT NULL,
  app_slug        TEXT,
  key_secret_name TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at      TEXT NOT NULL
);
`,
};
