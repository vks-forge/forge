/**
 * Inbox schemas — the list item, the views, the counts and the persisted read/archive row.
 *
 * Why: the Inbox is where a person sees what needs them or what changed (d-0116): a Worker's
 *   question, a ticket waiting for review or sign-off, a failed gate, a harness out of quota,
 *   a tool awaiting approval, a memory proposal. Items are derived from those source rows,
 *   not stored, so they can never disagree with the board. Only the person's own marks are
 *   stored: when they read or archived an item, and the item's `updated_at` at that moment.
 *   An item whose source changes afterwards (a newer `updated_at`) shows as unread and
 *   unarchived again, so archiving never hides something that has since moved. `needs_action`
 *   items are the ones that wait on a decision; the rest inform.
 *
 * Exports: INBOX_KINDS, InboxKind, InboxView, InboxItem, InboxListQuery, InboxPage,
 *   InboxCounts, InboxStateRow, INBOX_DEFAULT_LIMIT, INBOX_MAX_LIMIT.
 * Depends on: schemas/escalation, zod. No IO.
 */

import { z } from 'zod';
import { EscalationView } from '#/schemas/escalation.js';

/** What an item stands for; the `id` of an item is `<kind>:<source id>`. */
export const INBOX_KINDS = [
  'question',
  'ticket_review',
  'ticket_signoff',
  'ticket_waiting',
  'gate_failed',
  'run_interrupted',
  'quota_wait',
  'harness_compat',
  'tool_approval',
  'memory_proposal',
  'pipeline_proposal',
] as const;
export const InboxKind = z.enum(INBOX_KINDS);
export type InboxKind = z.infer<typeof InboxKind>;

export const InboxView = z.enum(['needs_action', 'unread', 'all', 'archived']);
export type InboxView = z.infer<typeof InboxView>;

export const INBOX_DEFAULT_LIMIT = 50;
export const INBOX_MAX_LIMIT = 200;

/** One inbox row. `project` is the project slug. */
export const InboxItem = z.object({
  id: z.string().min(1),
  kind: InboxKind,
  project: z.string().min(1),
  title: z.string().min(1),
  detail: z.string().optional(),
  ticket_id: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
  /** For a `question` item: the escalation behind it (a question, a failure or a setup), so the Inbox can act on it in place. Owner stage only. */
  escalation: EscalationView.optional(),
  /** Waits on a decision from the person (as opposed to merely informing). */
  needs_action: z.boolean(),
  /** When the source last changed; a mark older than this no longer counts. */
  updated_at: z.iso.datetime(),
  read: z.boolean(),
  archived: z.boolean(),
});
export type InboxItem = z.infer<typeof InboxItem>;

/** `GET /projects/:slug/inbox` parameters. */
export const InboxListQuery = z.object({
  view: InboxView.default('needs_action'),
  limit: z.coerce.number().int().min(1).max(INBOX_MAX_LIMIT).default(INBOX_DEFAULT_LIMIT),
  cursor: z.string().min(1).optional(),
});
export type InboxListQuery = z.infer<typeof InboxListQuery>;

export const InboxPage = z.object({
  items: z.array(InboxItem),
  nextCursor: z.string().min(1).nullable(),
});
export type InboxPage = z.infer<typeof InboxPage>;

/** Size of each view; the sidebar badge shows `needs_action` (or `unread`). */
export const InboxCounts = z.object({
  needs_action: z.number().int().nonnegative(),
  unread: z.number().int().nonnegative(),
  all: z.number().int().nonnegative(),
  archived: z.number().int().nonnegative(),
});
export type InboxCounts = z.infer<typeof InboxCounts>;

const Timestamp = z.iso.datetime();

/**
 * The `inbox_states` row: the person's marks on one item. `*_item_updated_at` is the item's
 * `updated_at` when the mark was made; a mark holds only while the item's `updated_at` is
 * not newer than it.
 */
export const InboxStateRow = z.object({
  project: z.string().min(1),
  kind: InboxKind,
  item_id: z.string().min(1),
  read_at: Timestamp.optional(),
  read_item_updated_at: Timestamp.optional(),
  archived_at: Timestamp.optional(),
  archived_item_updated_at: Timestamp.optional(),
});
export type InboxStateRow = z.infer<typeof InboxStateRow>;
