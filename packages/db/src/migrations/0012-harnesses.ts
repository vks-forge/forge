/**
 * Migration 0012: the harness registry.
 *
 * Why: Workers and the Director run on the coding harness the user installed (d-0087).
 *   The owner has to record which executable that is, how it authenticates (its own login,
 *   an API key or an OAuth token) and the result of the last environment test, and the
 *   server has to read that back at the start of every run. The credential itself never
 *   lands here; it lives in the SecretStore under `harness/<id>/...`. No rows are seeded:
 *   a row appears when the owner saves one through the API, and a run on an unregistered
 *   harness uses the defaults (PATH lookup, own login).
 *
 * Exports: MIGRATION_0012.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0012: Migration = {
  id: 12,
  name: 'harnesses',
  sql: `
CREATE TABLE harnesses (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('claude')),
  binary_path TEXT,
  version TEXT,
  auth_mode TEXT NOT NULL DEFAULT 'login' CHECK (auth_mode IN ('login', 'api_key', 'oauth_token')),
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'ok', 'error')),
  last_checked_at TEXT
);
`,
};
