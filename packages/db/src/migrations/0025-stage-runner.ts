/**
 * Migration 0025: the stage runner — a ticket's pipeline snapshot, its stage attempts and artifacts.
 *
 * Why: tickets now pass through the stages of their lane pipeline (write tests, implement, gates,
 *   review), and a restarted server must find a ticket exactly where it was. `ticket_pipelines`
 *   holds the ticket's own copy of its pipeline (so a later settings edit cannot change a started
 *   ticket), `stage_runs` one row per stage attempt, unique per ticket, stage, group member and
 *   rework cycle (so a double tick or a restart can never start a stage twice), and
 *   `stage_artifacts` what each stage was shown or made, with a hash. No cursor is stored: it is
 *   computed from the rows. The CHECK lists are copied into the SQL (a shipped migration must
 *   never change with a later edit of a core constant); a test pins them equal to core's lists.
 *   `wake_requests.kind` has no CHECK, so the new `stage` wake needs no table rebuild.
 *
 * Exports: MIGRATION_0025.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0025: Migration = {
  id: 25,
  name: 'stage-runner',
  sql: `
CREATE TABLE ticket_pipelines (
  ticket_id       TEXT PRIMARY KEY REFERENCES tickets (id),
  lane            TEXT NOT NULL CHECK (lane IN ('express','standard','full')),
  pipeline_json   TEXT NOT NULL,
  pipeline_hash   TEXT NOT NULL,
  config_version  TEXT NOT NULL,
  routed_json     TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE stage_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id     TEXT NOT NULL REFERENCES tickets (id),
  stage_id      TEXT NOT NULL,
  member_id     TEXT NOT NULL DEFAULT '',
  cycle         INTEGER NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('agent','script_gate','human')),
  agent_id      TEXT,
  agent_hash    TEXT,
  run_id        TEXT,
  status        TEXT NOT NULL CHECK (status IN ('running','passed','failed','error','waiting','skipped','adopted')),
  outcome_json  TEXT NOT NULL DEFAULT '{}',
  started_at    TEXT NOT NULL,
  ended_at      TEXT,
  UNIQUE (ticket_id, stage_id, member_id, cycle)
);
CREATE INDEX idx_stage_runs_ticket ON stage_runs (ticket_id);
CREATE INDEX idx_stage_runs_run ON stage_runs (run_id);

CREATE TABLE stage_artifacts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id     TEXT NOT NULL REFERENCES tickets (id),
  stage_run_id  INTEGER NOT NULL REFERENCES stage_runs (id),
  kind          TEXT NOT NULL CHECK (kind IN ('plan','ticket','diff','finish_claims','narrative','test_report','findings','gate_report')),
  content       TEXT NOT NULL,
  truncated     INTEGER NOT NULL DEFAULT 0,
  sha256        TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_stage_artifacts_ticket ON stage_artifacts (ticket_id);
`,
};
