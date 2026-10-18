/**
 * Migration 0029: project memory in the database, with its links, history, search index and import log.
 *
 * Why: the Director plans against a project's memory and Workers are told not to contradict it, so the
 *   memory must be exact to look up, searchable by relevance and impossible to rewrite. Records, their
 *   tags and links, their history and the versions of their search aids become plain tables; a full-text
 *   index (FTS5, porter stemming) is the only retrieval structure, no vectors (d-0168, r-0001). The rows
 *   keep the append-only rule that the markdown files had by convention: triggers abort any change to a
 *   record's words, source, author, origin, confidence or dates, to its history, and to anything but the
 *   three legal moves (approve, reject, supersede), so a bug in code cannot rewrite what the owner
 *   approved. Deletes abort too, except inside a project purge, which first puts one row in
 *   `memory_purge_guard`. The change is purely additive: new tables, indexes and triggers only; no
 *   existing table is rebuilt and no existing row moves. `memory_imports` records each attempt to bring
 *   an old per-project git repository in, so the server can tell a verified project from one still read
 *   from files. The CHECK lists are literals (a shipped migration must never change with a later edit of
 *   a core constant); a test pins them equal to core's lists.
 *
 * Exports: MIGRATION_0029.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

const IMMUTABLE_COLUMNS = [
  'project',
  'id',
  'statement',
  'body',
  'source_type',
  'source_ref',
  'author',
  'origin',
  'confidence',
  'created_at',
  'valid_from',
  'imported_from',
  'raw_front_matter',
  'lenient_fields',
]
  .map((c) => `NEW.${c} IS NOT OLD.${c}`)
  .join('\n     OR ');

const NO_DELETE = (table: string): string => `
CREATE TRIGGER ${table}_no_delete BEFORE DELETE ON ${table}
WHEN NOT EXISTS (SELECT 1 FROM memory_purge_guard)
BEGIN SELECT RAISE(ABORT, 'memory_immutable'); END;`;

const NO_UPDATE = (table: string): string => `
CREATE TRIGGER ${table}_no_update BEFORE UPDATE ON ${table}
BEGIN SELECT RAISE(ABORT, 'memory_immutable'); END;`;

export const MIGRATION_0029: Migration = {
  id: 29,
  name: 'memory',
  sql: `
CREATE TABLE memory_records (
  project         TEXT NOT NULL,
  id              TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('decision','rejected','proposal','outcome')),
  status          TEXT NOT NULL CHECK (status IN ('active','superseded','pending','rejected')),
  statement       TEXT NOT NULL CHECK (length(trim(statement)) > 0),
  body            TEXT NOT NULL DEFAULT '',
  source_type     TEXT NOT NULL,
  source_ref      TEXT NOT NULL,
  author          TEXT NOT NULL CHECK (author IN ('user','director')),
  origin          TEXT NOT NULL CHECK (origin IN ('owner','agent','untrusted','system','user-requested')),
  confidence      REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_at      TEXT NOT NULL,
  valid_from      TEXT NOT NULL,
  valid_to        TEXT,
  superseded_by   TEXT,
  pinned          INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0,1)),
  approved_at     TEXT,
  approved_by     TEXT,
  rejected_at     TEXT,
  rejected_by     TEXT,
  rejected_reason TEXT,
  gist            TEXT,
  aliases         TEXT NOT NULL DEFAULT '',
  imported_from   TEXT,
  raw_front_matter TEXT,
  lenient_fields  TEXT,
  PRIMARY KEY (project, id)
);
CREATE INDEX idx_memory_records_scope ON memory_records (project, status, kind);

CREATE TABLE memory_tags (
  project TEXT NOT NULL,
  id      TEXT NOT NULL,
  tag     TEXT NOT NULL,
  PRIMARY KEY (project, id, tag),
  FOREIGN KEY (project, id) REFERENCES memory_records (project, id)
);
CREATE INDEX idx_memory_tags_tag ON memory_tags (project, tag);

CREATE TABLE memory_links (
  project     TEXT NOT NULL,
  from_id     TEXT NOT NULL,
  rel         TEXT NOT NULL CHECK (rel IN ('supersedes','amends','reopens','cites','card','ticket')),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('record','card','ticket')),
  target      TEXT NOT NULL,
  PRIMARY KEY (project, from_id, rel, target),
  FOREIGN KEY (project, from_id) REFERENCES memory_records (project, id)
);
CREATE INDEX idx_memory_links_target ON memory_links (project, target);

CREATE TABLE memory_events (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  project     TEXT NOT NULL,
  id          TEXT NOT NULL,
  at          TEXT NOT NULL,
  actor       TEXT NOT NULL,
  event       TEXT NOT NULL CHECK (event IN ('imported','proposed','decided','approved','rejected','superseded','aids_set')),
  from_status TEXT,
  to_status   TEXT,
  reason      TEXT
);
CREATE INDEX idx_memory_events_record ON memory_events (project, id);

CREATE TABLE memory_aid_versions (
  project TEXT NOT NULL,
  id      TEXT NOT NULL,
  version INTEGER NOT NULL,
  at      TEXT NOT NULL,
  actor   TEXT NOT NULL,
  gist    TEXT,
  aliases TEXT NOT NULL,
  pinned  INTEGER NOT NULL,
  PRIMARY KEY (project, id, version)
);

CREATE VIRTUAL TABLE memory_fts USING fts5(
  statement, gist, tags, aliases, body,
  project UNINDEXED, id UNINDEXED,
  tokenize = 'porter unicode61', prefix = '2 3'
);
CREATE VIRTUAL TABLE memory_fts_vocab USING fts5vocab(memory_fts, 'row');

CREATE TABLE memory_access_log (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  project      TEXT NOT NULL,
  at           TEXT NOT NULL,
  actor        TEXT NOT NULL,
  tool         TEXT NOT NULL,
  query        TEXT,
  terms_json   TEXT,
  filters_json TEXT NOT NULL,
  hit_ids_json TEXT,
  total        INTEGER,
  ids_json     TEXT,
  run_id       TEXT,
  ticket_id    TEXT
);
CREATE INDEX idx_memory_access_project ON memory_access_log (project, seq);

CREATE TABLE memory_imports (
  project         TEXT NOT NULL,
  attempt         INTEGER NOT NULL,
  at              TEXT NOT NULL,
  state           TEXT NOT NULL CHECK (state IN ('pending','verified','needs_attention','failed')),
  head_sha        TEXT,
  files           INTEGER NOT NULL,
  imported        INTEGER NOT NULL,
  lenient         INTEGER NOT NULL,
  rejects_json    TEXT NOT NULL,
  backup_path     TEXT,
  verified_at     TEXT,
  repo_deleted_at TEXT,
  message         TEXT,
  PRIMARY KEY (project, attempt)
);

CREATE TABLE memory_purge_guard (project TEXT NOT NULL);
${NO_DELETE('memory_records')}
${NO_DELETE('memory_events')}
${NO_DELETE('memory_aid_versions')}
${NO_DELETE('memory_tags')}
${NO_DELETE('memory_links')}
${NO_UPDATE('memory_events')}
${NO_UPDATE('memory_aid_versions')}

CREATE TRIGGER memory_records_immutable BEFORE UPDATE ON memory_records
WHEN ${IMMUTABLE_COLUMNS}
  OR (OLD.approved_at IS NOT NULL AND NEW.approved_at IS NOT OLD.approved_at)
  OR (OLD.approved_by IS NOT NULL AND NEW.approved_by IS NOT OLD.approved_by)
  OR (OLD.rejected_at IS NOT NULL AND NEW.rejected_at IS NOT OLD.rejected_at)
  OR (OLD.rejected_by IS NOT NULL AND NEW.rejected_by IS NOT OLD.rejected_by)
  OR (OLD.rejected_reason IS NOT NULL AND NEW.rejected_reason IS NOT OLD.rejected_reason)
  OR (OLD.superseded_by IS NOT NULL AND NEW.superseded_by IS NOT OLD.superseded_by)
  OR (OLD.valid_to IS NOT NULL AND NEW.valid_to IS NOT OLD.valid_to)
BEGIN SELECT RAISE(ABORT, 'memory_immutable'); END;

CREATE TRIGGER memory_records_edges BEFORE UPDATE ON memory_records
WHEN (NEW.kind IS NOT OLD.kind OR NEW.status IS NOT OLD.status)
  AND NOT (
    (OLD.kind = 'proposal' AND OLD.status = 'pending' AND NEW.kind = 'decision' AND NEW.status = 'active')
    OR (OLD.kind = 'proposal' AND OLD.status = 'pending' AND NEW.kind = 'rejected' AND NEW.status = 'rejected')
    OR (OLD.kind = 'decision' AND OLD.status = 'active' AND NEW.kind = 'decision' AND NEW.status = 'superseded'
        AND OLD.superseded_by IS NULL AND OLD.valid_to IS NULL
        AND NEW.superseded_by IS NOT NULL AND NEW.valid_to IS NOT NULL)
  )
BEGIN SELECT RAISE(ABORT, 'memory_illegal_transition'); END;
`,
};
