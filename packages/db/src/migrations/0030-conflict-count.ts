/**
 * Migration 0030: how many merge-conflict resolver runs a ticket has spent.
 *
 * Why: when main moves under a ticket, Forge merges it into the ticket's branch and the ticket's
 *   writer resolves any clash. That road is capped (two resolves, then a human), and the count must
 *   survive a restart or a crash would hand a stuck ticket a fresh budget every time Forge came back
 *   up. It is its own column, not `rework_count`: a clash is the base's doing, not a failed gate, and
 *   must not eat the gate-failure budget. The change is purely additive: one NOT NULL column with a
 *   default of 0, so every existing ticket starts with no conflicts spent and no row is rebuilt.
 *
 * Exports: MIGRATION_0030.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0030: Migration = {
  id: 30,
  name: 'conflict-count',
  sql: `
ALTER TABLE tickets ADD COLUMN conflict_count INTEGER NOT NULL DEFAULT 0;
`,
};
