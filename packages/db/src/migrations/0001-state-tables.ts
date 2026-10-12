/**
 * Migration 0001: the mutable state tables and the append-only run log.
 *
 * Why: the Director's state is a hybrid: mutable rows the scheduler decides on
 *   (projects, tickets, wake_requests, runs, interactions) and append-only logs of what
 *   happened (run_events, run_inbox). Columns mirror the core schemas so the stored row
 *   is the domain row. There are deliberately no foreign keys: rows arrive from
 *   independent writers (intake, drivers, the API) and the Director validates references
 *   itself, so an out-of-order child row must not abort a transaction and lose an event.
 *   `projects`, `wake_requests` and `run_inbox` have no core schema, so their columns
 *   follow the design doc literally and are not zod-validated (director-core.md §3).
 *
 * Exports: MIGRATION_0001.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0001: Migration = {
  id: 1,
  name: 'state-tables',
  sql: `
CREATE TABLE projects (
  id                    TEXT PRIMARY KEY,
  slug                  TEXT NOT NULL UNIQUE,
  prefix                TEXT NOT NULL,
  repo_origin           TEXT,
  memory_repo           TEXT,
  harness_defaults_json TEXT NOT NULL DEFAULT '{}',
  tier_c_globs_json     TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE tickets (
  id                TEXT PRIMARY KEY,
  project           TEXT NOT NULL,
  epic_id           TEXT,
  parent_id         TEXT,
  title             TEXT NOT NULL,
  body              TEXT NOT NULL,
  type              TEXT NOT NULL,
  lane              TEXT NOT NULL,
  tier_predicted    TEXT NOT NULL,
  tier_actual       TEXT,
  status            TEXT NOT NULL,
  status_version    INTEGER NOT NULL CHECK (status_version >= 0),
  rework_count      INTEGER NOT NULL DEFAULT 0,
  blocked_reason    TEXT,
  blocked_by_json   TEXT NOT NULL DEFAULT '[]',
  assignee_run_id   TEXT,
  branch            TEXT,
  worktree          TEXT,
  checkout_run_id   TEXT,
  created_by_intake INTEGER,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX idx_tickets_status ON tickets (status);
CREATE INDEX idx_tickets_project ON tickets (project);

CREATE TABLE ticket_relations (
  from_id    TEXT NOT NULL,
  to_id      TEXT NOT NULL,
  kind       TEXT NOT NULL,
  created_at TEXT,
  PRIMARY KEY (from_id, to_id, kind)
);
CREATE INDEX idx_ticket_relations_to ON ticket_relations (to_id);

CREATE TABLE intake_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source       TEXT NOT NULL,
  kind         TEXT NOT NULL,
  dedupe_key   TEXT NOT NULL,
  actor_json   TEXT NOT NULL,
  project      TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  received_at  TEXT NOT NULL,
  ticket_id    TEXT,
  UNIQUE (source, dedupe_key)
);

CREATE TABLE wake_requests (
  id              TEXT PRIMARY KEY,
  ticket_id       TEXT NOT NULL,
  reason          TEXT NOT NULL,
  kind            TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  coalesced_count INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending',
  not_before      TEXT,
  UNIQUE (ticket_id, reason, idempotency_key)
);
CREATE INDEX idx_wake_requests_status ON wake_requests (status, not_before);

CREATE TABLE runs (
  id             TEXT PRIMARY KEY,
  ticket_id      TEXT NOT NULL,
  harness        TEXT NOT NULL,
  driver_version TEXT NOT NULL,
  session_ref    TEXT,
  cwd            TEXT NOT NULL,
  lane           TEXT NOT NULL,
  started_at     TEXT NOT NULL,
  ended_at       TEXT,
  status         TEXT NOT NULL,
  usage_json     TEXT,
  cost_usd       REAL,
  error_family   TEXT,
  retry_of       TEXT
);
CREATE INDEX idx_runs_ticket ON runs (ticket_id);

CREATE TABLE run_events (
  run_id       TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  ts           TEXT NOT NULL,
  kind         TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (run_id, seq)
) WITHOUT ROWID;

CREATE TABLE run_inbox (
  run_id       TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  mode         TEXT NOT NULL,
  author       TEXT NOT NULL,
  text         TEXT NOT NULL,
  delivered_at TEXT,
  PRIMARY KEY (run_id, seq)
) WITHOUT ROWID;

CREATE TABLE interactions (
  id           TEXT PRIMARY KEY,
  ticket_id    TEXT NOT NULL,
  run_id       TEXT,
  kind         TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status       TEXT NOT NULL,
  asked_at     TEXT NOT NULL,
  answered_at  TEXT,
  timeout_at   TEXT NOT NULL,
  answer_json  TEXT
);
CREATE INDEX idx_interactions_status ON interactions (status, asked_at);
`,
};
