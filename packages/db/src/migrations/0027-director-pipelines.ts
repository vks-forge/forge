/**
 * Migration 0027: the Director's per-ticket pipeline changes, proposals, finding marks and fallback records.
 *
 * Why: the Director may adjust a ticket's own copy of its lane pipeline (d-0151), so the copy keeps the hash
 *   of the list it started from (`base_hash`, so tickets on the same base can be compared) and the log of every
 *   change applied or dropped (`adjusted_json`); existing copies start with their own hash as base and an empty
 *   log, which is true: nothing adjusted them. A run records the model it asked for and which entry of its
 *   agent's fallback list it ran on (d-0080), so the strip and the scorecards say what really ran. A proposal
 *   to change a project's lane is a row of its own (it belongs to a project and a lane, not to a ticket); its
 *   unique key covers every status, so a change the owner decided on is never proposed again for the same
 *   base list. The owner's "Real" or "False alarm" on a finding is stored by stage row and finding index. All
 *   changes are additive (new nullable or defaulted columns, new tables): no table is rebuilt and no row moves.
 *   The CHECK lists are literals (a shipped migration must never change with a later edit of a core
 *   constant); a test pins them equal to core's lists.
 *
 * Exports: MIGRATION_0027.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0027: Migration = {
  id: 27,
  name: 'director-pipelines',
  sql: `
ALTER TABLE ticket_pipelines ADD COLUMN base_hash TEXT;
UPDATE ticket_pipelines SET base_hash = pipeline_hash;
ALTER TABLE ticket_pipelines ADD COLUMN adjusted_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE runs ADD COLUMN model TEXT;
ALTER TABLE runs ADD COLUMN fallback_slot INTEGER;

CREATE TABLE pipeline_proposals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project         TEXT NOT NULL,
  lane            TEXT NOT NULL CHECK (lane IN ('express','standard','full')),
  key             TEXT NOT NULL,
  base_hash       TEXT NOT NULL,
  op_json         TEXT NOT NULL,
  proposed_json   TEXT NOT NULL,
  evidence_json   TEXT NOT NULL,
  count           INTEGER NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected','stale')),
  created_at      TEXT NOT NULL,
  decided_at      TEXT,
  decided_reason  TEXT,
  config_version  TEXT
);
CREATE UNIQUE INDEX idx_pipeline_proposals_key ON pipeline_proposals (project, lane, key, base_hash);
CREATE INDEX idx_pipeline_proposals_project ON pipeline_proposals (project, status);

CREATE TABLE finding_marks (
  stage_run_id    INTEGER NOT NULL REFERENCES stage_runs (id),
  finding_index   INTEGER NOT NULL,
  ticket_id       TEXT NOT NULL REFERENCES tickets (id),
  verdict         TEXT NOT NULL CHECK (verdict IN ('real','false_alarm')),
  marked_at       TEXT NOT NULL,
  PRIMARY KEY (stage_run_id, finding_index)
);
CREATE INDEX idx_finding_marks_ticket ON finding_marks (ticket_id);
`,
};
