/**
 * Ordered migration list.
 *
 * Why: one array is the schema history; ids must be strictly increasing and a shipped
 *   migration is never edited, only followed by a new one (forward-only).
 *
 * Exports: MIGRATIONS.
 * Depends on: migrations/0001-state-tables, migrations/0002-verification-tables. No IO.
 */

import { MIGRATION_0001 } from '#/migrations/0001-state-tables.js';
import { MIGRATION_0002 } from '#/migrations/0002-verification-tables.js';
import type { Migration } from '#/types/migrations.types.js';

export const MIGRATIONS: readonly Migration[] = [MIGRATION_0001, MIGRATION_0002];
