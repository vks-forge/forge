/**
 * Migration 0024: the agent a run used, on the run row.
 *
 * Why: a run now belongs to an agent (who it was, on which harness and model, with which
 *   instructions and limits), and the owner must be able to say afterwards which exact
 *   definition ran: the id names the agent and the hash names its effective definition at the
 *   moment the run started, so a later edit never rewrites history. Both columns are nullable:
 *   runs written before agents existed stay null and read as "no agent recorded".
 *
 * Exports: MIGRATION_0024.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0024: Migration = {
  id: 24,
  name: 'run-agent',
  sql: `
ALTER TABLE runs ADD COLUMN agent_id TEXT;
ALTER TABLE runs ADD COLUMN agent_hash TEXT;
`,
};
