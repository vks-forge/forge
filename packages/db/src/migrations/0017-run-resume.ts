/**
 * Migration 0017: runs that survive a restart, and the receipt chain across generations.
 *
 * Why: stopping the server must not kill the Workers it was running (d-0092). A run that was
 *   live is marked `interrupted` and the next start resumes it from the harness session,
 *   under a NEW run token and a NEW receipt secret (d-0100). Three things must outlive the
 *   process: `runs.generation` (which secret generation the run is in, 1 until its first
 *   resume), `runs.resumable_session` (the harness session the resume loads, captured when
 *   the run was stopped) and `runs.interrupted_at`. The receipt chain gains one record kind:
 *   `receipt_resumes` rows join the chain segment signed under one generation's secret to the
 *   next, linking to the last receipt before it, so gate G1 can verify each segment with its
 *   own secret and see that nothing was cut out between them. Decision and effect rows get a
 *   `generation` column (default 1, filled by the log from the chain position) so a reader can
 *   tell which secret signed a row without replaying the chain. Existing rows are generation 1
 *   and unchanged; `runs.status` has no CHECK, so `interrupted` needs no table rebuild.
 *
 * Exports: MIGRATION_0017.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0017: Migration = {
  id: 17,
  name: 'run-resume',
  sql: `
ALTER TABLE runs ADD COLUMN generation INTEGER NOT NULL DEFAULT 1;
ALTER TABLE runs ADD COLUMN resumable_session TEXT;
ALTER TABLE runs ADD COLUMN interrupted_at TEXT;

ALTER TABLE tool_decisions ADD COLUMN generation INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tool_effects ADD COLUMN generation INTEGER NOT NULL DEFAULT 1;

CREATE TABLE receipt_resumes (
  run_id     TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 2),
  chain_seq  INTEGER NOT NULL CHECK (chain_seq > 0),
  ts         TEXT NOT NULL,
  prev_hash  TEXT,
  hash       TEXT NOT NULL,
  PRIMARY KEY (run_id, generation)
);
CREATE UNIQUE INDEX idx_receipt_resumes_chain ON receipt_resumes (run_id, chain_seq);
`,
};
