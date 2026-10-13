/**
 * Migration 0006: pull request number and URL on the ticket.
 *
 * Why: once the engine pushes a branch and opens a PR, the ticket must remember which PR
 *   it is, so a restarted server can still read that PR's status, merge it after the gates
 *   pass, or close it on cancel. Without the link the only trace of the PR would be the
 *   host's own state, and the verify-then-merge flow could not resume (d-0062). Both
 *   columns are nullable: a ticket has no PR until the engine opens one.
 *
 * Exports: MIGRATION_0006.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0006: Migration = {
  id: 6,
  name: 'ticket-pr',
  sql: `
ALTER TABLE tickets ADD COLUMN pr_number INTEGER;
ALTER TABLE tickets ADD COLUMN pr_url TEXT;
`,
};
