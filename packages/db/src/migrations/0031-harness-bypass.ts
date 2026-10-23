/**
 * Migration 0031: per-harness "Bypass permissions" flag.
 *
 * Why: the owner decides per harness whether Workers run without asking (d-0183). The choice must
 *   survive a restart and be read by the run launch path, so it is a column on the harness row. It is
 *   nullable on purpose: NULL means "never set" and reads as on (the one default lives in core's
 *   `bypassOn()`), so existing harness rows keep today's behaviour with no backfill and a later change
 *   of the default never has to rewrite rows. Purely additive; no row is rebuilt.
 *
 * Exports: MIGRATION_0031.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0031: Migration = {
  id: 31,
  name: 'harness-bypass',
  sql: `
ALTER TABLE harnesses ADD COLUMN bypass_permissions INTEGER;
`,
};
