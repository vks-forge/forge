/**
 * Migration 0026: the Full lane's Director check as a stage row, with its report artifact.
 *
 * Why: the Full lane adds a stage the Director itself performs (it checks the writers' work
 *   against the plan). That check is recorded like every other stage attempt, as a `stage_runs`
 *   row of kind `director`, and its verdict is stored as a `check_report` artifact, so a restarted
 *   server finds the ticket exactly where the check left it. Both tables hold CHECK lists of
 *   allowed kinds, and SQLite cannot widen a CHECK in place, so each table is rebuilt. Tickets
 *   already in flight have stage history that must survive the upgrade unchanged: ids are kept
 *   (artifacts point at their stage run by id), so are all columns, the unique attempt key and
 *   the indexes. The CHECK lists are literals (a shipped migration must never change with a later
 *   edit of a core constant); a test pins them equal to core's lists.
 *   The runner holds one transaction, where `PRAGMA foreign_keys` cannot be switched, so the
 *   order keeps foreign keys satisfied throughout: build both new tables (the new artifact table
 *   points at the new run table), copy, drop the child then the parent, rename.
 *
 * Exports: MIGRATION_0026.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0026: Migration = {
  id: 26,
  name: 'full-lane',
  sql: `
CREATE TABLE stage_runs_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id     TEXT NOT NULL REFERENCES tickets (id),
  stage_id      TEXT NOT NULL,
  member_id     TEXT NOT NULL DEFAULT '',
  cycle         INTEGER NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('agent','script_gate','human','director')),
  agent_id      TEXT,
  agent_hash    TEXT,
  run_id        TEXT,
  status        TEXT NOT NULL CHECK (status IN ('running','passed','failed','error','waiting','skipped','adopted')),
  outcome_json  TEXT NOT NULL DEFAULT '{}',
  started_at    TEXT NOT NULL,
  ended_at      TEXT,
  UNIQUE (ticket_id, stage_id, member_id, cycle)
);

INSERT INTO stage_runs_new
  (id, ticket_id, stage_id, member_id, cycle, kind, agent_id, agent_hash, run_id, status, outcome_json, started_at, ended_at)
SELECT id, ticket_id, stage_id, member_id, cycle, kind, agent_id, agent_hash, run_id, status, outcome_json, started_at, ended_at
  FROM stage_runs;

CREATE TABLE stage_artifacts_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id     TEXT NOT NULL REFERENCES tickets (id),
  stage_run_id  INTEGER NOT NULL REFERENCES stage_runs_new (id),
  kind          TEXT NOT NULL CHECK (kind IN ('plan','ticket','diff','finish_claims','narrative','test_report','findings','gate_report','check_report')),
  content       TEXT NOT NULL,
  truncated     INTEGER NOT NULL DEFAULT 0,
  sha256        TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

INSERT INTO stage_artifacts_new
  (id, ticket_id, stage_run_id, kind, content, truncated, sha256, created_at)
SELECT id, ticket_id, stage_run_id, kind, content, truncated, sha256, created_at
  FROM stage_artifacts;

DROP TABLE stage_artifacts;
DROP TABLE stage_runs;

ALTER TABLE stage_runs_new RENAME TO stage_runs;
ALTER TABLE stage_artifacts_new RENAME TO stage_artifacts;

CREATE INDEX idx_stage_runs_ticket ON stage_runs (ticket_id);
CREATE INDEX idx_stage_runs_run ON stage_runs (run_id);
CREATE INDEX idx_stage_artifacts_ticket ON stage_artifacts (ticket_id);
`,
};
