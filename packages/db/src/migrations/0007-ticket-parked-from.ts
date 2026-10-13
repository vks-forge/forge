/**
 * Migration 0007: where a parked ticket came from.
 *
 * Why: a ticket parked from Verifying already has a finished Worker run, a branch and
 *   often a PR. When a human releases it, the engine must resume publish, gates and merge on
 *   that same run; sending it back to Planned would dispatch a new Worker that redoes
 *   finished work. The state machine needs one persisted fact to tell the two parks apart
 *   after a server restart, and no other column carries it. The column is nullable: it is
 *   set only while a ticket waits in WaitingHuman after a verify-time park, and cleared by
 *   the next transition.
 *
 * Exports: MIGRATION_0007.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0007: Migration = {
  id: 7,
  name: 'ticket-parked-from',
  sql: `
ALTER TABLE tickets ADD COLUMN parked_from TEXT;
`,
};
