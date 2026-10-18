/**
 * Migration 0028: fetched research sources and checked card evidence.
 *
 * Why: the Director may research outside facts while it plans (d-0144), and Workers may read web pages
 *   through the MCP tools. Each fetched page is a row of its own: it keeps the capped page text the engine
 *   checks quotes against, the hash of the full page, who fetched it and when. A Director source belongs to a
 *   card and carries the card's own number (`S1`, `S2`, ...); a unique index on (card, ref) means a research
 *   step that reruns after a restart can never produce a second `S1`. A Worker source belongs to a run and
 *   ticket and has no card ref. Evidence is the engine's checked claims with their verified quotes and the
 *   sources they sit in; it is plain rows, never a vector store (r-0001). The change is purely additive: two
 *   new tables and three indexes, no table is rebuilt and no existing row moves. The CHECK lists are literals
 *   (a shipped migration must never change with a later edit of a core constant); a test pins them equal to
 *   core's lists.
 *
 * Exports: MIGRATION_0028.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0028: Migration = {
  id: 28,
  name: 'research',
  sql: `
CREATE TABLE research_sources (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project      TEXT NOT NULL,
  card_id      TEXT REFERENCES cards (id),
  ticket_id    TEXT REFERENCES tickets (id),
  run_id       TEXT,
  ref          TEXT,
  origin       TEXT NOT NULL CHECK (origin IN ('director','worker')),
  url          TEXT NOT NULL,
  final_url    TEXT NOT NULL,
  title        TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  sha256       TEXT NOT NULL,
  bytes        INTEGER NOT NULL,
  truncated    INTEGER NOT NULL CHECK (truncated IN (0,1)),
  text         TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_research_sources_card_ref ON research_sources (card_id, ref) WHERE card_id IS NOT NULL;
CREATE INDEX idx_research_sources_run ON research_sources (run_id);
CREATE INDEX idx_research_sources_project ON research_sources (project);

CREATE TABLE card_evidence (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id      TEXT NOT NULL REFERENCES cards (id),
  ref          TEXT NOT NULL,
  step_id      TEXT NOT NULL,
  origin       TEXT NOT NULL CHECK (origin IN ('research_step','grill_detour')),
  question     TEXT,
  claim        TEXT NOT NULL,
  quotes_json  TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('verified','unverified')),
  created_at   TEXT NOT NULL,
  UNIQUE (card_id, ref)
);
`,
};
