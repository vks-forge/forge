/**
 * Migration 0005: run lifecycle, wake bookkeeping, receipt resource, relations as the one source.
 *
 * Why: the engine tick, reconcile and the gates need things the first four migrations did
 *   not store. Reconcile must know which Forge server instance owns a `running` run and
 *   which process it is (`owner`, `pid`), when it last produced anything (`last_event_at`),
 *   the catalogue and prompt it ran under, and when its hook first checked in
 *   (`hook_registered_at`); `idx_runs_status` serves the status scans. The re-wake cap
 *   counts wake requests per ticket per hour, so wakes need `created_at` and a
 *   `consumed_at`. Each decision receipt names what the call touched (`resource`, covered by
 *   its MAC) so a gate can match a claim to a receipt. Finally, `ticket_relations` becomes
 *   the only home of parent and blocker links: legacy `tickets.parent_id` and
 *   `blocked_by_json` are copied into it and dropped, because two copies would disagree and
 *   a ticket could start while a blocker is open. Runs and wakes that predate this
 *   migration get a placeholder owner (`pre-0005`) that no live server matches, so
 *   reconcile treats an old `running` run as unowned, which is what d-0054 wants after a
 *   restart.
 *
 * Exports: MIGRATION_0005.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0005: Migration = {
  id: 5,
  name: 'ports-batch-c',
  sql: `
ALTER TABLE runs ADD COLUMN owner TEXT NOT NULL DEFAULT 'pre-0005';
ALTER TABLE runs ADD COLUMN pid INTEGER;
ALTER TABLE runs ADD COLUMN last_event_at TEXT;
ALTER TABLE runs ADD COLUMN catalogue_hash TEXT;
ALTER TABLE runs ADD COLUMN prompt_hash TEXT;
ALTER TABLE runs ADD COLUMN hook_registered_at TEXT;
CREATE INDEX idx_runs_status ON runs (status);

ALTER TABLE wake_requests ADD COLUMN created_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
ALTER TABLE wake_requests ADD COLUMN consumed_at TEXT;
CREATE INDEX idx_wake_requests_ticket_created ON wake_requests (ticket_id, created_at);

CREATE INDEX idx_interactions_ticket ON interactions (ticket_id, asked_at);

ALTER TABLE tool_decisions ADD COLUMN resource TEXT;

INSERT OR IGNORE INTO ticket_relations (from_id, to_id, kind, created_at)
  SELECT id, parent_id, 'spawned_from', created_at FROM tickets WHERE parent_id IS NOT NULL ORDER BY rowid;
INSERT OR IGNORE INTO ticket_relations (from_id, to_id, kind, created_at)
  SELECT t.id, j.value, 'depends_on', t.created_at FROM tickets t, json_each(t.blocked_by_json) j ORDER BY t.rowid, j.key;
ALTER TABLE tickets DROP COLUMN parent_id;
ALTER TABLE tickets DROP COLUMN blocked_by_json;
`,
};
