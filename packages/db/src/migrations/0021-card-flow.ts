/**
 * Migration 0021: the card-flow foundation — stored card phase, card relations, the durable
 * reply queue and the card id on interactions.
 *
 * Why: under the card-first flow (d-0128, d-0134) a request is planned before it is worked,
 *   so a card needs its own stored lifecycle instead of a column rolled up from tickets:
 *   `phase` with a CAS `phase_version`, a `needs_you` flag, a priority and context links.
 *   Dependencies between cards are edges in `card_relations` (one `depends_on` kind, "blocks"
 *   is its reverse view, same project enforced in code). The Director's owed replies move from
 *   engine memory to `card_reply_queue`, so a restart no longer drops a message the owner
 *   wrote. `interactions.card_id` lets a question belong to a card (S2, S4 add the kinds).
 *
 *   Existing cards are backfilled from today's facts (d-0141 item 7) and nothing is queued,
 *   so an old card is never auto-grilled: closed cards become `closed`; cards with a live
 *   (not cancelled) ticket become `in_progress`, or `done` when every live ticket is done;
 *   open Plan and Issue cards without a live ticket become `plan_ready` with `needs_you` and
 *   a "Start planning" note, which gives the owner an action instead of a dead card. A
 *   Discussion is never planned, so it stays in `grilling` without a flag. A card that waits
 *   on a ticket (DCP-C1) is `in_progress`; its Needs you overlay is derived at read time.
 *
 *   The card type registry follows the decisions too: `plan_approval` turns from a boolean
 *   into `director_or_user | user` (Plan and Issue let the Director approve behind the floor;
 *   a custom type keeps its old yes as `director_or_user`, no as `user`), and the Issue
 *   type stops filing a ticket at intake; only the PR fast path (`pr_issue`) keeps it.
 *
 * Exports: MIGRATION_0021.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

const PHASES = `'grilling','verifying','plan_ready','approved','queued','in_progress','done','closed'`;

export const MIGRATION_0021: Migration = {
  id: 21,
  name: 'card-flow',
  sql: `
ALTER TABLE cards ADD COLUMN phase TEXT NOT NULL DEFAULT 'grilling' CHECK (phase IN (${PHASES}));
ALTER TABLE cards ADD COLUMN phase_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN needs_you INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent'));
ALTER TABLE cards ADD COLUMN links_json TEXT NOT NULL DEFAULT '[]';

UPDATE cards SET phase = 'closed' WHERE closed_reason IS NOT NULL;

UPDATE cards SET phase = 'plan_ready', needs_you = 1
  WHERE closed_reason IS NULL AND type <> 'discussion'
    AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.card_id = cards.id AND t.status <> 'cancelled');

INSERT INTO card_events (card_id, seq, kind, at, actor_type, actor_id, payload_json)
  SELECT c.id,
    (SELECT COALESCE(MAX(e.seq), -1) + 1 FROM card_events e WHERE e.card_id = c.id),
    'note', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'system', 'migration-0021',
    json_object('text', 'Start planning: this card was made before the Director planned requests. Ask the Director in the chat to start, and it will ask what it needs and write a plan.')
  FROM cards c WHERE c.phase = 'plan_ready' AND c.needs_you = 1;

UPDATE cards SET phase = CASE
    WHEN NOT EXISTS (SELECT 1 FROM tickets t WHERE t.card_id = cards.id AND t.status NOT IN ('cancelled', 'done')) THEN 'done'
    ELSE 'in_progress' END
  WHERE closed_reason IS NULL AND phase = 'grilling'
    AND EXISTS (SELECT 1 FROM tickets t WHERE t.card_id = cards.id AND t.status <> 'cancelled');

CREATE TABLE card_relations (
  from_card  TEXT NOT NULL REFERENCES cards (id),
  to_card    TEXT NOT NULL REFERENCES cards (id),
  kind       TEXT NOT NULL CHECK (kind IN ('depends_on')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (from_card, to_card, kind),
  CHECK (from_card <> to_card)
);
CREATE INDEX idx_card_relations_to ON card_relations (to_card);

CREATE TABLE card_reply_queue (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id     TEXT NOT NULL REFERENCES cards (id),
  event_id    INTEGER NOT NULL,
  reason      TEXT NOT NULL CHECK (reason IN ('card_created', 'user_message')),
  enqueued_at TEXT NOT NULL,
  claimed_at  TEXT,
  done_at     TEXT
);
CREATE INDEX idx_card_reply_queue_open ON card_reply_queue (done_at, claimed_at);
CREATE INDEX idx_card_reply_queue_card ON card_reply_queue (card_id);

ALTER TABLE interactions ADD COLUMN card_id TEXT;
CREATE INDEX idx_interactions_card ON interactions (card_id);

ALTER TABLE card_types ADD COLUMN plan_approval_mode TEXT NOT NULL DEFAULT 'user';
UPDATE card_types SET plan_approval_mode = CASE plan_approval WHEN 1 THEN 'director_or_user' ELSE 'user' END;
UPDATE card_types SET plan_approval_mode = 'director_or_user', tickets_on_intake = 0 WHERE name = 'issue';
ALTER TABLE card_types DROP COLUMN plan_approval;
ALTER TABLE card_types RENAME COLUMN plan_approval_mode TO plan_approval;
`,
};
