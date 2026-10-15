/**
 * Project memory record schemas — the front matter of every record and the writer's inputs.
 *
 * Why: a project's memory is what the Director plans against, so the shape of a record, who
 *   wrote it and whether the owner approved it are safety facts, not formatting. One schema
 *   for the record means the writer, the reader, the API and the files on disk cannot drift,
 *   and the inputs the writer accepts carry no `author`, `status` or `id`: the writer sets
 *   those, so a caller cannot dress an inference up as an owner decision (d-0007, d-0086).
 *   Records stay open (`looseObject`) so a hand-added field such as `amends` survives a
 *   rewrite instead of being dropped.
 *
 * Exports: MEMORY_ID_PATTERN, MemoryKind, MemoryStatus, MemoryAuthor, MemoryOrigin,
 *   MemorySourceRef, MemoryRecord, MemoryRecordWithBody, MemoryListEntry, ProposalInput,
 *   DecisionInput (each schema and type).
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** `d-0001`, `x-0013`, `r-0004`, `o-0002`: one letter for the folder family, four digits. */
export const MEMORY_ID_PATTERN = /^[a-z]-\d{4}$/;

export const MemoryKind = z.enum(['decision', 'rejected', 'proposal', 'outcome']);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemoryStatus = z.enum(['active', 'superseded', 'pending', 'rejected']);
export type MemoryStatus = z.infer<typeof MemoryStatus>;

/** Who wrote the record: the owner (`user`) or the Director's own inference (`director`). */
export const MemoryAuthor = z.enum(['user', 'director']);
export type MemoryAuthor = z.infer<typeof MemoryAuthor>;

/** Where the content came from; set by the writer, never by the model (memory-system.md section 7). */
export const MemoryOrigin = z.enum([
  'owner',
  'agent',
  'untrusted',
  'system',
  'user-requested',
]);

export type MemoryOrigin = z.infer<typeof MemoryOrigin>;

/** Provenance pointer, for example `{ type: chat, ref: "the user's message" }`. */
export const MemorySourceRef = z.object({
  type: z.string().trim().min(1),
  ref: z.string().trim().min(1),
});

export type MemorySourceRef = z.infer<typeof MemorySourceRef>;

/** The YAML front matter of one record file. */
export const MemoryRecord = z.looseObject({
  id: z.string().regex(MEMORY_ID_PATTERN, 'id must look like d-0001'),
  kind: MemoryKind,
  statement: z.string().trim().min(1, 'statement must not be empty'),
  source: MemorySourceRef,
  author: MemoryAuthor,
  origin: MemoryOrigin,
  status: MemoryStatus,
  valid_from: z.string().min(1),
  valid_to: z.string().nullable().optional(),
  superseded_by: z.string().nullable().optional(),
  supersedes: z.string().nullable().optional(),
  approved_at: z.string().optional(),
  approved_by: z.string().optional(),
  rejected_at: z.string().optional(),
  rejected_by: z.string().optional(),
  rejected_reason: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).default([]),
  pinned: z.boolean().default(false),
});

export type MemoryRecord = z.infer<typeof MemoryRecord>;

/** A record with its markdown body, as `GET /projects/:slug/memory/:id` returns it. */
export const MemoryRecordWithBody = MemoryRecord.extend({ body: z.string() });
export type MemoryRecordWithBody = z.infer<typeof MemoryRecordWithBody>;

/** One line of the memory list. */
export const MemoryListEntry = z.object({
  id: MemoryRecord.shape.id,
  kind: MemoryRecord.shape.kind,
  status: MemoryRecord.shape.status,
  statement: MemoryRecord.shape.statement,
  tags: MemoryRecord.shape.tags,
});

export type MemoryListEntry = z.infer<typeof MemoryListEntry>;

const statement = z.string().trim().min(1, 'statement must not be empty');

/** What the Director may propose; capped confidence keeps inferences visibly uncertain (CLAUDE.md). */
export const ProposalInput = z.object({
  statement,
  source: MemorySourceRef,
  origin: MemoryOrigin.optional(),
  tags: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(0.8).optional(),
  body: z.string().optional(),
});

export type ProposalInput = z.infer<typeof ProposalInput>;

/** What the owner decided; the writer stamps `author: user`. */
export const DecisionInput = z.object({
  statement,
  source: MemorySourceRef,
  origin: MemoryOrigin.optional(),
  tags: z.array(z.string()).optional(),
  pinned: z.boolean().optional(),
  body: z.string().optional(),
});

export type DecisionInput = z.infer<typeof DecisionInput>;
