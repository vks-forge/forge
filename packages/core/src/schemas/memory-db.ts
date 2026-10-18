/**
 * Memory in the database — the stored row, links, history and the views built from them.
 *
 * Why: a project's memory is what the Director plans against and what Workers are told not to
 *   contradict, so the database must hold more than text: who wrote a record, how it links to
 *   other records, cards and tickets, every state move it went through and which search aids
 *   (gist, aliases, pinned) were set when. One set of schemas means the SQL adapter, the
 *   in-memory adapter, the importer, the exporter, the HTTP views and the Worker tools all agree
 *   on what a record is, and a value read back from storage is parsed, not trusted. The row keeps
 *   `statement`, `source`, `author` and `origin` exactly as written (append-only): the schema
 *   here describes them, the storage triggers enforce it (d-0007, d-0086, d-0168).
 *
 * Exports: MEMORY_TAG_PATTERN, MemoryTag, MemoryLinkRel, MemoryLink, MemoryEventKind, MemoryEvent,
 *   MemoryAidVersion, MemoryRow, MemoryLinkRow, NewMemoryEvent, MemoryRecordView, MemoryImportRecord,
 *   MemoryImportState, MemoryImportStatus, MemoryExportReply, MemoryAccessLogRow, NewMemoryAccess,
 *   MEMORY_LINK_RELS, MEMORY_EVENT_KINDS, MEMORY_IMPORT_STATES (each schema and type).
 * Depends on: schemas/memory-record, zod. No IO.
 */

import { z } from 'zod';
import {
  MEMORY_ID_PATTERN,
  MemoryAuthor,
  MemoryKind,
  MemoryOrigin,
  MemoryStatus,
} from '#/schemas/memory-record.js';

/** Lower-case words of 1-40 characters; tags are rows of their own, never links. */
export const MEMORY_TAG_PATTERN = /^[a-z0-9._-]{1,40}$/;
export const MemoryTag = z
  .string()
  .regex(MEMORY_TAG_PATTERN, 'tag must be 1-40 of a-z 0-9 . _ -');
export type MemoryTag = z.infer<typeof MemoryTag>;

const RecordId = z.string().regex(MEMORY_ID_PATTERN, 'id must look like d-0001');

export const MEMORY_LINK_RELS = [
  'supersedes',
  'amends',
  'reopens',
  'cites',
  'card',
  'ticket',
] as const;

export const MemoryLinkRel = z.enum(MEMORY_LINK_RELS);
export type MemoryLinkRel = z.infer<typeof MemoryLinkRel>;

/** One edge from a record to another record, a card or a ticket. */
export const MemoryLink = z
  .object({
    rel: MemoryLinkRel,
    target_kind: z.enum(['record', 'card', 'ticket']),
    target: z.string().min(1).max(120),
  })
  .strict();

export type MemoryLink = z.infer<typeof MemoryLink>;

/** An edge as stored: it also names the record it starts from. */
export const MemoryLinkRow = MemoryLink.extend({ from_id: RecordId }).strict();
export type MemoryLinkRow = z.infer<typeof MemoryLinkRow>;

export const MEMORY_EVENT_KINDS = [
  'imported',
  'proposed',
  'decided',
  'approved',
  'rejected',
  'superseded',
  'aids_set',
] as const;

export const MemoryEventKind = z.enum(MEMORY_EVENT_KINDS);
export type MemoryEventKind = z.infer<typeof MemoryEventKind>;

/** One entry of a record's history; `seq` is allocated by storage alone. */
export const MemoryEvent = z
  .object({
    seq: z.number().int().positive(),
    id: RecordId,
    at: z.string().min(1),
    actor: z.string().min(1),
    event: MemoryEventKind,
    from_status: MemoryStatus.nullable(),
    to_status: MemoryStatus.nullable(),
    reason: z.string().nullable(),
  })
  .strict();

export type MemoryEvent = z.infer<typeof MemoryEvent>;

/** What the caller supplies for the history entry written in the same transaction as a change. */
export const NewMemoryEvent = MemoryEvent.omit({ seq: true, id: true });
export type NewMemoryEvent = z.infer<typeof NewMemoryEvent>;

/** One setting of the search aids; versions start at 1 and never change. */
export const MemoryAidVersion = z
  .object({
    version: z.number().int().positive(),
    at: z.string().min(1),
    actor: z.string().min(1),
    gist: z.string().nullable(),
    aliases: z.string().nullable(),
    pinned: z.boolean(),
  })
  .strict();

export type MemoryAidVersion = z.infer<typeof MemoryAidVersion>;

/** A record exactly as the table holds it. */
export const MemoryRow = z
  .object({
    project: z.string().min(1),
    id: RecordId,
    kind: MemoryKind,
    status: MemoryStatus,
    statement: z
      .string()
      .refine((s) => s.trim().length > 0, 'statement must not be empty'),
    body: z.string(),
    source_type: z.string().min(1),
    source_ref: z.string().min(1),
    author: MemoryAuthor,
    origin: MemoryOrigin,
    confidence: z.number().min(0).max(1).nullable(),
    created_at: z.string().min(1),
    valid_from: z.string().min(1),
    valid_to: z.string().nullable(),
    superseded_by: z.string().nullable(),
    pinned: z.boolean(),
    approved_at: z.string().nullable(),
    approved_by: z.string().nullable(),
    rejected_at: z.string().nullable(),
    rejected_by: z.string().nullable(),
    rejected_reason: z.string().nullable(),
    gist: z.string().max(160).nullable(),
    aliases: z.array(z.string().min(1).max(40)).max(8),
    imported_from: z.string().nullable(),
    raw_front_matter: z.string().nullable(),
    lenient_fields: z.array(z.string()).nullable(),
  })
  .strict();

export type MemoryRow = z.infer<typeof MemoryRow>;

/** What `get` and the HTTP record return; `body` is capped at 4 000 characters. */
export const MemoryRecordView = z
  .object({
    id: RecordId,
    kind: MemoryKind,
    status: MemoryStatus,
    statement: z.string(),
    body: z.string(),
    body_truncated: z.boolean(),
    tags: z.array(z.string()),
    source: z.object({ type: z.string(), ref: z.string() }).strict(),
    author: MemoryAuthor,
    origin: MemoryOrigin,
    confidence: z.number().nullable(),
    pinned: z.boolean(),
    valid_from: z.string(),
    valid_to: z.string().nullable(),
    supersedes: z.string().nullable(),
    superseded_by: z.string().nullable(),
    approved_at: z.string().optional(),
    approved_by: z.string().optional(),
    rejected_at: z.string().optional(),
    rejected_by: z.string().optional(),
    rejected_reason: z.string().optional(),
    gist: z.string().nullable(),
    aliases: z.array(z.string()),
    links: z.array(MemoryLink).max(20),
    imported: z
      .object({ from: z.string(), defaulted_fields: z.array(z.string()) })
      .strict()
      .nullable(),
    possible_conflicts: z
      .array(z.object({ id: RecordId, line: z.string() }).strict())
      .max(3)
      .optional(),
  })
  .strict();

export type MemoryRecordView = z.infer<typeof MemoryRecordView>;

export const MEMORY_IMPORT_STATES = [
  'pending',
  'verified',
  'needs_attention',
  'failed',
] as const;

export const MemoryImportState = z.enum(MEMORY_IMPORT_STATES);
export type MemoryImportState = z.infer<typeof MemoryImportState>;

/** One import attempt as stored (`memory_imports`); the latest attempt is the project's state. */
export const MemoryImportRecord = z
  .object({
    attempt: z.number().int().positive(),
    at: z.string().min(1),
    state: MemoryImportState,
    head_sha: z.string().nullable(),
    files: z.number().int().nonnegative(),
    imported: z.number().int().nonnegative(),
    lenient: z.number().int().nonnegative(),
    rejects: z.array(z.object({ path: z.string(), reason: z.string() }).strict()),
    backup_path: z.string().nullable(),
    verified_at: z.string().nullable(),
    repo_deleted_at: z.string().nullable(),
    message: z.string().nullable(),
  })
  .strict();

export type MemoryImportRecord = z.infer<typeof MemoryImportRecord>;

/** What the API and the web read: the latest attempt, or `not_needed` when the project never had an old repository. */
export const MemoryImportStatus = MemoryImportRecord.omit({ attempt: true, at: true })
  .extend({ state: z.enum(['not_needed', ...MEMORY_IMPORT_STATES]) })
  .strict();

export type MemoryImportStatus = z.infer<typeof MemoryImportStatus>;

/** Where an export landed. */
export const MemoryExportReply = z
  .object({ path: z.string(), files: z.number().int().nonnegative(), at: z.string() })
  .strict();

export type MemoryExportReply = z.infer<typeof MemoryExportReply>;

/** One memory read as logged, to measure what a search missed. */
export const NewMemoryAccess = z
  .object({
    at: z.string().min(1),
    actor: z.enum(['director', 'worker', 'cli', 'web']),
    tool: z.enum(['search', 'get', 'related']),
    query: z.string().nullable(),
    terms: z.array(z.string()).nullable(),
    filters: z.record(z.string(), z.unknown()),
    hit_ids: z.array(z.string()).nullable(),
    total: z.number().int().nonnegative().nullable(),
    ids: z.array(z.string()).nullable(),
    run_id: z.string().nullable(),
    ticket_id: z.string().nullable(),
  })
  .strict();

export type NewMemoryAccess = z.infer<typeof NewMemoryAccess>;

export const MemoryAccessLogRow = NewMemoryAccess.extend({
  seq: z.number().int().positive(),
}).strict();

export type MemoryAccessLogRow = z.infer<typeof MemoryAccessLogRow>;
