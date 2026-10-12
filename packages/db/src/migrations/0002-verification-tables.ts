/**
 * Migration 0002: gate results, tool receipts and the skills registry.
 *
 * Why: the verification and tool planes record evidence per run (director-core.md §3
 *   `gate_results`, tool-system.md §10 `tool_decisions`/`tool_effects`,
 *   self-improvement.md §4 `skills_registry`/`skill_usage`). None has a core zod schema
 *   yet, so every table here is provisional and follows the doc column list literally.
 *
 * Exports: MIGRATION_0002.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0002: Migration = {
  id: 2,
  name: 'verification-tables',
  sql: `
CREATE TABLE gate_results (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT NOT NULL,
  gate        TEXT NOT NULL,
  status      TEXT NOT NULL,
  report_ref  TEXT,
  started_at  TEXT NOT NULL,
  ended_at    TEXT
);
CREATE INDEX idx_gate_results_run ON gate_results (run_id);

CREATE TABLE tool_decisions (
  id               TEXT PRIMARY KEY,
  run_id           TEXT NOT NULL,
  seq              INTEGER NOT NULL,
  tool             TEXT NOT NULL,
  version          TEXT,
  schema_hash      TEXT,
  args_hash        TEXT NOT NULL,
  decision         TEXT NOT NULL,
  layer            TEXT NOT NULL,
  rule_id          TEXT,
  finding_ids_json TEXT NOT NULL DEFAULT '[]',
  approver         TEXT,
  approval_ref     TEXT,
  enforced_by      TEXT,
  ts               TEXT NOT NULL,
  prev_hash        TEXT,
  hash             TEXT NOT NULL,
  UNIQUE (run_id, seq)
);

CREATE TABLE tool_effects (
  decision_id    TEXT PRIMARY KEY,
  state          TEXT NOT NULL,
  result_hash    TEXT,
  result_ref     TEXT,
  duration_ms    INTEGER,
  cost_usd       REAL,
  checkpoint_ref TEXT,
  ts             TEXT NOT NULL,
  prev_hash      TEXT,
  hash           TEXT NOT NULL
);

CREATE TABLE skills_registry (
  name                  TEXT NOT NULL,
  version               TEXT NOT NULL,
  content_hash          TEXT NOT NULL,
  signature             TEXT,
  allowed_projects_json TEXT NOT NULL DEFAULT '[]',
  lanes_json            TEXT NOT NULL DEFAULT '[]',
  parent_version        TEXT,
  deprecated_at         TEXT,
  PRIMARY KEY (name, version)
);

CREATE TABLE skill_usage (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id         TEXT NOT NULL,
  component_kind TEXT NOT NULL,
  name           TEXT NOT NULL,
  version        TEXT NOT NULL,
  loaded_at      TEXT NOT NULL,
  referenced     INTEGER NOT NULL DEFAULT 0 CHECK (referenced IN (0, 1))
);
CREATE INDEX idx_skill_usage_run ON skill_usage (run_id);
`,
};
