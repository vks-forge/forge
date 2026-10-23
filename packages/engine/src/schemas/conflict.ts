/**
 * Schemas of a merge conflict as it travels from the sync step to the ticket's writer.
 *
 * Why: when main moves under a ticket and the two changes clash, the clash must reach the Worker that
 *   can fix it (and, if that fails, the owner) intact: which files, which of them cannot be merged by
 *   editing markers (binary, deleted on one side), and which earlier tickets changed them first. The
 *   words ride in a durable wake reason (the next prompt is built from it even after a restart), so
 *   they are parsed at that boundary like any stored JSON.
 *
 * Exports: ConflictFileInfo, ConflictUpstream, ConflictInfo.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** One clashing file; `binary` and `deleted_by` mean its markers cannot be edited by hand. */
export const ConflictFileInfo = z.object({
  path: z.string().min(1),
  binary: z.boolean().optional(),
  deleted_by: z.enum(['ticket', 'base']).optional(),
});
export type ConflictFileInfo = z.infer<typeof ConflictFileInfo>;

/** A change main gained first: a short commit ref, the Forge ticket behind it when the subject names one, and its title. */
export const ConflictUpstream = z.object({
  ref: z.string().min(1),
  ticket_id: z.string().min(1).optional(),
  title: z.string().min(1),
  /** The start of that ticket's plan, so the writer knows what it set out to do. */
  summary: z.string().optional(),
});
export type ConflictUpstream = z.infer<typeof ConflictUpstream>;

/** What the writer is told about a clash, plus the owner's note on a retry. */
export const ConflictInfo = z.object({
  files: z.array(ConflictFileInfo).max(50),
  upstream: z.array(ConflictUpstream).max(20),
  note: z.string().optional(),
});
export type ConflictInfo = z.infer<typeof ConflictInfo>;
