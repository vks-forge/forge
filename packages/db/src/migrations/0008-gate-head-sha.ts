/**
 * Migration 0008: the commit a gate verdict judged.
 *
 * Why: gates take minutes, and the branch can move while they run (a push, a force-push,
 *   a Worker still writing). A pass is only evidence for the commit the gates actually
 *   looked at, so the merge must be pinned to it: the engine records the head sha on the
 *   verdict rows and refuses to merge, or asks the host to refuse, when the PR head is
 *   anywhere else. The column is nullable because rows written before this migration have
 *   no recorded sha; such a pass is never trusted for a merge and the gates run again.
 *
 * Exports: MIGRATION_0008.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0008: Migration = {
  id: 8,
  name: 'gate-head-sha',
  sql: `
ALTER TABLE gate_results ADD COLUMN head_sha TEXT;
`,
};
