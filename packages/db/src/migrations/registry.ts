/**
 * Ordered migration list.
 *
 * Why: the schema's history is one ordered list so a fresh database and a years-old one
 *   reach the same shape. Ids strictly increase and a shipped migration is never edited,
 *   because databases that already applied it would silently differ from new ones; every
 *   change is a new migration, and the runner enforces this with checksums.
 *
 * Exports: MIGRATIONS.
 * Depends on: migrations/0001-state-tables, migrations/0002-verification-tables,
 *   migrations/0003-receipt-chain, migrations/0004-run-tokens. No IO.
 */

import { MIGRATION_0001 } from '#/migrations/0001-state-tables.js';
import { MIGRATION_0002 } from '#/migrations/0002-verification-tables.js';
import { MIGRATION_0003 } from '#/migrations/0003-receipt-chain.js';
import { MIGRATION_0004 } from '#/migrations/0004-run-tokens.js';
import type { Migration } from '#/types/migrations.types.js';

export const MIGRATIONS: readonly Migration[] = [
  MIGRATION_0001,
  MIGRATION_0002,
  MIGRATION_0003,
  MIGRATION_0004,
];
