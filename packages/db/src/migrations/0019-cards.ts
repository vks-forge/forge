/**
 * Migration 0019: cards, card history, the card type registry and `tickets.card_id`.
 *
 * Why: every intake becomes a card, the record the Director triages into tickets (d-0105),
 *   and a ticket always belongs to one. `cards` holds the record, `card_events` its
 *   append-only history (numbered per card by storage), `card_types` the registry as data
 *   rows seeded with Discussion, Plan, Issue and PR issue so new types need no code (d-0106).
 *   The Board column is not stored: it is rolled up from tickets and questions.
 *
 *   Existing tickets are backfilled with one card each, so no ticket is left parentless:
 *   the card id reuses the ticket's number (`SF-12` becomes `SF-C12`), the type is `issue`,
 *   the title and summary are the ticket's, and the source is the stored intake event's
 *   source and dedupe key (or `legacy` and the ticket id when the ticket has no intake).
 *   Each card gets a `user_message` and a `ticket_created` event stamped with the ticket's
 *   creation time; how the ticket moved before this migration is not known and is not
 *   invented. The numbers of cards made later continue from the highest stored number.
 *   There are no foreign keys, as in migration 0001: the engine validates references.
 *
 * Exports: MIGRATION_0019.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0019: Migration = {
  id: 19,
  name: 'cards',
  sql: `
CREATE TABLE card_types (
  name                 TEXT PRIMARY KEY,
  label                TEXT NOT NULL,
  icon                 TEXT NOT NULL,
  allowed_sources_json TEXT NOT NULL,
  actions_json         TEXT NOT NULL,
  plan_approval        INTEGER NOT NULL,
  tickets_on_intake    INTEGER NOT NULL,
  default_lane         TEXT
);

INSERT INTO card_types (name, label, icon, allowed_sources_json, actions_json, plan_approval, tickets_on_intake, default_lane) VALUES
  ('discussion', 'Discussion', 'message-circle', '["chat","github_issue"]', '["chat","convert","close"]', 0, 0, NULL),
  ('plan', 'Plan', 'list-checks', '["chat","github_issue"]', '["chat","approve_plan","convert","close"]', 1, 0, NULL),
  ('issue', 'Issue', 'circle-dot', '["chat","github_issue","webhook","cron","telemetry","bug_report","legacy"]', '["chat","convert","close"]', 0, 1, NULL),
  ('pr_issue', 'PR issue', 'git-pull-request', '["github_pr","webhook","chat"]', '["chat","convert","close"]', 0, 1, NULL);

CREATE TABLE cards (
  id              TEXT PRIMARY KEY,
  project         TEXT NOT NULL,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  summary         TEXT NOT NULL,
  source_kind     TEXT NOT NULL,
  source_ref      TEXT NOT NULL,
  created_by_type TEXT NOT NULL,
  created_by_id   TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  closed_reason   TEXT,
  budget_cap_usd  REAL
);
CREATE INDEX idx_cards_project ON cards (project, updated_at, id);

CREATE TABLE card_events (
  card_id      TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  kind         TEXT NOT NULL,
  at           TEXT NOT NULL,
  actor_type   TEXT NOT NULL,
  actor_id     TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (card_id, seq)
) WITHOUT ROWID;

ALTER TABLE tickets ADD COLUMN card_id TEXT;
CREATE INDEX idx_tickets_card ON tickets (card_id);

INSERT INTO cards (id, project, type, title, summary, source_kind, source_ref,
    created_by_type, created_by_id, created_at, updated_at)
  SELECT
    substr(t.id, 1, instr(t.id, '-')) || 'C' || substr(t.id, instr(t.id, '-') + 1),
    t.project, 'issue', t.title, t.body,
    COALESCE(e.source, 'legacy'), COALESCE(e.dedupe_key, t.id),
    COALESCE(json_extract(e.actor_json, '$.type'), 'system'),
    COALESCE(json_extract(e.actor_json, '$.id'), 'migration-0019'),
    t.created_at, t.updated_at
  FROM tickets t LEFT JOIN intake_events e ON e.id = t.created_by_intake;

UPDATE tickets
  SET card_id = substr(id, 1, instr(id, '-')) || 'C' || substr(id, instr(id, '-') + 1);

INSERT INTO card_events (card_id, seq, kind, at, actor_type, actor_id, payload_json)
  SELECT id, 0, 'user_message', created_at, created_by_type, created_by_id,
    json_object('text', CASE WHEN summary = '' THEN title ELSE summary END)
  FROM cards;

INSERT INTO card_events (card_id, seq, kind, at, actor_type, actor_id, payload_json)
  SELECT card_id, 1, 'ticket_created', created_at, 'system', 'migration-0019',
    json_object('ticket_id', id, 'title', title)
  FROM tickets;
`,
};
