/**
 * Migration 0022: card planning — the flow snapshot, grill state and plan versions of a card,
 * and the planning reasons of the reply queue.
 *
 * Why: the Director plans a card over several ticks and may be restarted in between, so what
 *   it has settled must live in the database, not in engine memory. A card now stores the flow
 *   it started with (a snapshot: editing the flow later never changes a card already planning),
 *   the index of the next step, the config revision of the snapshot, and its structured grill
 *   state (open question, answers, assumptions, findings; `{}` for a card that never planned,
 *   so an old card reads as empty and is never auto-planned). Every plan the Director writes is
 *   a row in `card_plans`, append-only by (card, version), so a revision keeps the earlier
 *   versions and the owner can compare them.
 *
 *   The owner's answers to a grill question, "Start planning" and "Request changes" each owe the
 *   Director a reply, so the reply queue accepts three more reasons. SQLite cannot change a
 *   CHECK in place, so the queue is rebuilt: rows are copied with their ids (the engine refers
 *   to them), the AUTOINCREMENT counter is carried over so an id is never reused, and the two
 *   indexes are recreated. Nothing references the queue, so the rebuild is safe inside the
 *   runner's single transaction (foreign-key enforcement cannot be switched there). The reason
 *   list is written out here, not read from core, because a shipped migration must never change
 *   when a later reason is added; a test pins it equal to core's list at this version.
 *
 * Exports: MIGRATION_0022.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

const REASONS = `'card_created', 'user_message', 'grill_answer', 'start_planning', 'plan_changes'`;

export const MIGRATION_0022: Migration = {
  id: 22,
  name: 'card-planning',
  sql: `
ALTER TABLE cards ADD COLUMN flow_json TEXT;
ALTER TABLE cards ADD COLUMN flow_config_version INTEGER;
ALTER TABLE cards ADD COLUMN flow_cursor INTEGER;
ALTER TABLE cards ADD COLUMN grill_state_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE card_plans (
  card_id    TEXT NOT NULL REFERENCES cards (id),
  version    INTEGER NOT NULL,
  plan_json  TEXT NOT NULL,
  created_at TEXT NOT NULL,
  author     TEXT NOT NULL CHECK (author IN ('director', 'owner')),
  PRIMARY KEY (card_id, version)
);

CREATE TABLE card_reply_queue_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id     TEXT NOT NULL REFERENCES cards (id),
  event_id    INTEGER NOT NULL,
  reason      TEXT NOT NULL CHECK (reason IN (${REASONS})),
  enqueued_at TEXT NOT NULL,
  claimed_at  TEXT,
  done_at     TEXT
);

INSERT INTO card_reply_queue_new (id, card_id, event_id, reason, enqueued_at, claimed_at, done_at)
  SELECT id, card_id, event_id, reason, enqueued_at, claimed_at, done_at FROM card_reply_queue;

DELETE FROM sqlite_sequence WHERE name = 'card_reply_queue_new';
INSERT INTO sqlite_sequence (name, seq)
  SELECT 'card_reply_queue_new', seq FROM sqlite_sequence WHERE name = 'card_reply_queue';

DROP TABLE card_reply_queue;
ALTER TABLE card_reply_queue_new RENAME TO card_reply_queue;

CREATE INDEX idx_card_reply_queue_open ON card_reply_queue (done_at, claimed_at);
CREATE INDEX idx_card_reply_queue_card ON card_reply_queue (card_id);
`,
};
