/**
 * MemoryRepository port — project memory rows, tags, links, history, search and the import log.
 *
 * Why: a project's memory is the one place the Director's constraints live, so every change must be
 *   atomic with its history entry, ids must never repeat, and a record may only move along the three
 *   legal edges (approve, reject, supersede) while its words never change. This port is that contract:
 *   inserts carry their tags, links and history entry in the same transaction, `transition` is the one
 *   state change, and search runs inside storage so scope (project, status, kind, tags) is applied in
 *   the query and never after ranking. Behind it the SQL adapter holds the rules twice (code and
 *   triggers) and the in-memory adapter lets engine and server tests run without SQLite (d-0168).
 *
 * Exports: MemoryEdge, MemoryEdgeFields, MemoryListFilter, MemoryCount, LexicalSearchInput, LexicalHit,
 *   MemoryLinks, ImportedRowCheck, MemoryRepository.
 * Depends on: schemas/memory-db, schemas/memory-db-tools. Types only.
 */

import type {
  MemoryAccessLogRow,
  MemoryAidVersion,
  MemoryEvent,
  MemoryImportRecord,
  MemoryLink,
  MemoryLinkRow,
  MemoryRow,
  NewMemoryAccess,
  NewMemoryEvent,
} from '#/schemas/memory-db.js';
import type { MemoryScope } from '#/schemas/memory-db-tools.js';
import type { MemoryKind, MemoryStatus } from '#/schemas/memory-record.js';

/** The three legal state moves: a proposal is approved or rejected, a decision is superseded. */
export type MemoryEdge = 'approve' | 'reject' | 'supersede';

/** The columns a move stamps; `kind` and `status` follow from the edge and are set by storage. */
export type MemoryEdgeFields =
  | { readonly approved_at: string; readonly approved_by: string }
  | {
      readonly rejected_at: string;
      readonly rejected_by: string;
      readonly rejected_reason: string;
    }
  | { readonly superseded_by: string; readonly valid_to: string };

export interface MemoryListFilter {
  readonly kinds?: readonly MemoryKind[];
  readonly statuses?: readonly MemoryStatus[];
  /** Any-of; a record with no tags never matches a non-empty list. */
  readonly tags?: readonly string[];
  readonly pinned?: boolean;
  readonly ids?: readonly string[];
  /** `id` ascending (default) or newest `created_at` first. */
  readonly order?: 'id' | 'newest';
  readonly limit?: number;
  readonly offset?: number;
}

export interface MemoryCount {
  readonly kind: MemoryKind;
  readonly status: MemoryStatus;
  readonly count: number;
}

export interface LexicalSearchInput {
  readonly project: string;
  /** A match expression built by core `buildMatch`: quoted terms only. */
  readonly match: string;
  readonly scope: MemoryScope;
  readonly limit: number;
  /** Also return a snippet of the best column, with U+0001 / U+0002 around each matched word. */
  readonly snippet: boolean;
}

/** `score` is higher for a better match; the SQL adapter negates bm25. */
export interface LexicalHit {
  readonly id: string;
  readonly score: number;
  readonly snippet: string | null;
}

/** A record's edges: those it starts, those pointing at it, and records sharing a card or ticket with it. */
export interface MemoryLinks {
  readonly out: readonly MemoryLinkRow[];
  readonly in: readonly MemoryLinkRow[];
  readonly shared: readonly {
    readonly id: string;
    readonly rel: 'card' | 'ticket';
    readonly target: string;
  }[];
}

/** What import verification compares: the stored words and a hash of the body, not the body. */
export interface ImportedRowCheck {
  readonly id: string;
  readonly kind: MemoryKind;
  readonly status: MemoryStatus;
  readonly statement: string;
  readonly body_sha256: string;
  readonly tags: readonly string[];
  readonly imported_from: string | null;
  /** True once a state move or an aids change followed the import, so kind and status may legitimately differ. */
  readonly moved: boolean;
}

export interface MemoryRepository {
  /**
   * Stores the record, its tags and links and the history entry in one step; returns the entry's `seq`.
   * A repeated (project, id) throws InvalidInputError.
   */
  insertRecord(
    row: MemoryRow,
    tags: readonly string[],
    links: readonly MemoryLink[],
    event: NewMemoryEvent,
  ): Promise<number>;

  /**
   * The single state change: sets `kind` and `status` for the edge, stamps `fields`, writes the history entry.
   * Throws MemoryRecordNotFoundError for an unknown record and MemoryRecordStateError when the edge is not legal from its state.
   */
  transition(
    project: string,
    id: string,
    edge: MemoryEdge,
    fields: MemoryEdgeFields,
    event: NewMemoryEvent,
  ): Promise<number>;

  /** Changes the search aids, keeps a version row and a history entry, and reindexes the record. */
  setAids(
    project: string,
    id: string,
    aids: { gist: string | null; aliases: readonly string[]; pinned: boolean },
    actor: string,
    at: string,
  ): Promise<void>;

  /** The next free id for the letter (`d` gives `d-0001`): highest used plus one, never a reused number. */
  nextId(project: string, letter: string): Promise<string>;

  get(project: string, id: string): Promise<MemoryRow | null>;
  list(project: string, filter?: MemoryListFilter): Promise<MemoryRow[]>;
  counts(project: string): Promise<MemoryCount[]>;

  /** Ranked matches inside the scope; `[]` for an empty match. Never returns another project's rows. */
  searchLexical(input: LexicalSearchInput): Promise<LexicalHit[]>;
  /** How many records of the project hold each term (by the index's own stemming), for ranking. */
  documentFrequency(
    project: string,
    terms: readonly string[],
  ): Promise<Record<string, number>>;

  linksOf(project: string, id: string): Promise<MemoryLinks>;
  /** Tag to number of records holding it; over every record of the project, or only those in `statuses`. */
  tagStats(
    project: string,
    statuses?: readonly MemoryStatus[],
  ): Promise<Record<string, number>>;
  tagsOf(project: string, ids: readonly string[]): Promise<Record<string, string[]>>;
  history(
    project: string,
    id: string,
  ): Promise<{ events: MemoryEvent[]; versions: MemoryAidVersion[] }>;

  appendAccess(project: string, row: NewMemoryAccess): Promise<void>;
  listAccess(project: string, limit: number): Promise<MemoryAccessLogRow[]>;
  /** Keeps the newest `keepRows` rows and drops rows older than `olderThan` (ISO). */
  pruneAccess(project: string, keepRows: number, olderThan: string): Promise<number>;

  /** Rebuilds the project's search index from its rows. */
  reindex(project: string): Promise<void>;

  /** The latest import attempt, or null when the project never had one. */
  importState(project: string): Promise<MemoryImportRecord | null>;
  /** Inserts or replaces the attempt with this number. */
  saveImport(project: string, record: MemoryImportRecord): Promise<void>;
  checksForImport(project: string): Promise<ImportedRowCheck[]>;
}
