/**
 * Migration 0032: the Director spend ledger.
 *
 * Why: the Director's own model steps (planning, chat, escalation answers, sign-off checks) cost real money
 *   that no run records. It lived as one undated running total inside each card's planning state, so the
 *   Cost page, Overview and ticket pages, which are built on runs, left it out while the card added it
 *   ($7.43 on Cost against $24.86 on the cards), and a step on a ticket with no card was tracked nowhere. A
 *   row per step, dated and tied to its project, card and ticket when known, lets every page add Worker and
 *   Director spend the same way. The migration is additive (one table, three indexes; no row moves) and
 *   backfills one row per card from the old total, dated at the card's last update and kind `backfill`: the
 *   history before this migration is known per card, not per day, so Overview charts show it as a spike on
 *   that day. The old total stays in the card's planning state as a cached sum the budget check reads. The
 *   backfill skips a card that already has its row, so running it twice adds nothing.
 *
 * Exports: MIGRATION_0032.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0032: Migration = {
  id: 32,
  name: 'director-spend',
  sql: `
CREATE TABLE director_spend (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  project   TEXT NOT NULL,
  card_id   TEXT REFERENCES cards (id),
  ticket_id TEXT REFERENCES tickets (id),
  kind      TEXT NOT NULL,
  model     TEXT,
  usd       REAL NOT NULL CHECK (usd >= 0),
  recorded  INTEGER NOT NULL CHECK (recorded IN (0,1)),
  at        TEXT NOT NULL
);
CREATE INDEX idx_director_spend_project_at ON director_spend (project, at);
CREATE INDEX idx_director_spend_card ON director_spend (card_id);
CREATE INDEX idx_director_spend_ticket ON director_spend (ticket_id);

INSERT INTO director_spend (project, card_id, kind, usd, recorded, at)
SELECT c.project, c.id, 'backfill', CAST(json_extract(c.grill_state_json, '$.director_spend_usd') AS REAL), 1, c.updated_at
FROM cards c
WHERE COALESCE(json_extract(c.grill_state_json, '$.director_spend_usd'), 0) > 0
  AND NOT EXISTS (SELECT 1 FROM director_spend d WHERE d.card_id = c.id AND d.kind = 'backfill');
`,
};
