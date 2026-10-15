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
 *   migrations/0003-receipt-chain, migrations/0004-run-tokens, migrations/0005-ports-batch-c, migrations/0006-ticket-pr,
 *   migrations/0007-ticket-parked-from, migrations/0008-gate-head-sha, migrations/0009-config-versions,
 *   migrations/0010-run-config-version, migrations/0011-many-projects, migrations/0012-harnesses. No IO.
 *   migrations/0010-run-config-version, migrations/0012-harnesses, migrations/0013-catalogue-and-compat,
 *   migrations/0016-scheduling. No IO.
 */

import { MIGRATION_0001 } from '#/migrations/0001-state-tables.js';
import { MIGRATION_0002 } from '#/migrations/0002-verification-tables.js';
import { MIGRATION_0003 } from '#/migrations/0003-receipt-chain.js';
import { MIGRATION_0004 } from '#/migrations/0004-run-tokens.js';
import { MIGRATION_0005 } from '#/migrations/0005-ports-batch-c.js';
import { MIGRATION_0006 } from '#/migrations/0006-ticket-pr.js';
import { MIGRATION_0007 } from '#/migrations/0007-ticket-parked-from.js';
import { MIGRATION_0008 } from '#/migrations/0008-gate-head-sha.js';
import { MIGRATION_0009 } from '#/migrations/0009-config-versions.js';
import { MIGRATION_0010 } from '#/migrations/0010-run-config-version.js';
import { MIGRATION_0011 } from '#/migrations/0011-many-projects.js';
import { MIGRATION_0012 } from '#/migrations/0012-harnesses.js';
import { MIGRATION_0013 } from '#/migrations/0013-catalogue-and-compat.js';
import { MIGRATION_0016 } from '#/migrations/0016-scheduling.js';
import type { Migration } from '#/types/migrations.types.js';

export const MIGRATIONS: readonly Migration[] = [
  MIGRATION_0001,
  MIGRATION_0002,
  MIGRATION_0003,
  MIGRATION_0004,
  MIGRATION_0005,
  MIGRATION_0006,
  MIGRATION_0007,
  MIGRATION_0008,
  MIGRATION_0009,
  MIGRATION_0010,
  MIGRATION_0011,
  MIGRATION_0012,
  MIGRATION_0013,
  MIGRATION_0016,
];
