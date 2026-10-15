/**
 * Migration 0016: ticket priority and parked harnesses.
 *
 * Why: with several projects sharing a few Worker slots, the Director must pick fairly:
 *   a ticket someone marked urgent starts before its project's other waiting tickets, so the
 *   rank has to live on the ticket row (`priority`, higher first, 0 for every existing
 *   ticket). And when a harness reports that the account is out of quota, every ticket that
 *   needs it must wait for the reset instead of failing the same way; `harness_state`
 *   records that pause (until when, and why) per harness so it survives a restart and the
 *   UI can show it (d-0097). No rows are seeded: a pause appears only after a quota error.
 *
 * Exports: MIGRATION_0016.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0016: Migration = {
  id: 16,
  name: 'scheduling',
  sql: `
ALTER TABLE tickets ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;

CREATE TABLE harness_state (
  harness_id TEXT PRIMARY KEY,
  paused_until TEXT NOT NULL,
  reason TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`,
};
