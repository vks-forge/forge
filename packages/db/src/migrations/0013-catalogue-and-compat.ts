/**
 * Migration 0013: the tool catalogue and the per-build harness compatibility tables.
 *
 * Why: what a Worker may do is decided by the tool catalogue, so it moves from a file in
 *   the checkout, where a Worker could reach it, into the database (d-0085). Every save is
 *   a new immutable row with an author and a reason, and triggers refuse UPDATE and DELETE,
 *   so a run can name the catalogue it ran under and a bad change is reverted by saving the
 *   old document again. Forge no longer pins one harness version (d-0088): `harness_versions`
 *   records, per installed build, whether the compatibility check passed and the report it
 *   produced, and `harness_tool_schemas` holds the input schema hash of each built-in tool
 *   of that build with the owner's decision (approved, pending, denied). A tool without an
 *   approved row is refused, which is how a new or hand-edited tool shape fails closed.
 *   The `harnesses` table is rebuilt (SQLite cannot widen a CHECK) so a failed check can
 *   set the status `paused` and keep a plain-language note beside it; rows keep their
 *   order. No catalogue row is seeded here: the store writes the built-in catalogue as
 *   version 1 in code the first time it opens.
 *
 * Exports: MIGRATION_0013.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0013: Migration = {
  id: 13,
  name: 'catalogue-and-compat',
  sql: `
CREATE TABLE harnesses_new (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('claude')),
  binary_path TEXT,
  version TEXT,
  auth_mode TEXT NOT NULL DEFAULT 'login' CHECK (auth_mode IN ('login', 'api_key', 'oauth_token')),
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'ok', 'error', 'paused')),
  last_checked_at TEXT,
  status_note TEXT
);

INSERT INTO harnesses_new (id, kind, binary_path, version, auth_mode, status, last_checked_at)
  SELECT id, kind, binary_path, version, auth_mode, status, last_checked_at
  FROM harnesses ORDER BY rowid;

DROP TABLE harnesses;
ALTER TABLE harnesses_new RENAME TO harnesses;

CREATE TABLE catalogue_versions (
  version INTEGER PRIMARY KEY CHECK (version >= 1),
  doc_json TEXT NOT NULL,
  author TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TRIGGER catalogue_versions_no_update BEFORE UPDATE ON catalogue_versions
BEGIN
  SELECT RAISE(ABORT, 'catalogue_versions rows are immutable');
END;

CREATE TRIGGER catalogue_versions_no_delete BEFORE DELETE ON catalogue_versions
BEGIN
  SELECT RAISE(ABORT, 'catalogue_versions rows are immutable');
END;

CREATE TABLE harness_versions (
  kind TEXT NOT NULL,
  version TEXT NOT NULL,
  compat TEXT NOT NULL CHECK (compat IN ('pass', 'fail', 'pending')),
  report_json TEXT,
  checked_at TEXT,
  PRIMARY KEY (kind, version)
);

CREATE TABLE harness_tool_schemas (
  harness_kind TEXT NOT NULL,
  version TEXT NOT NULL,
  tool TEXT NOT NULL,
  schema_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved', 'pending', 'denied')),
  decided_by TEXT,
  decided_at TEXT,
  decision_reason TEXT,
  PRIMARY KEY (harness_kind, version, tool)
);
`,
};
