/**
 * Ticket schemas — lanes, tiers, types, statuses and the Ticket row.
 *
 * Why: the ticket row is what the scheduler decides on every tick, so the engine, HTTP
 *   API, gates, storage and UI must agree on its fields and on the closed sets that
 *   steer work: lane (how much process), tier A/B/C (who must sign off), type (branch
 *   prefix) and status (where the ticket is). Defining them once means a stored row or
 *   API body that drifts is rejected at the boundary rather than quietly misrouting a
 *   ticket, for example treating a tier-C change as auto-mergeable. `status_version` is
 *   the compare-and-swap counter that makes stale writers lose (director-core.md §3-§4,
 *   verification-plane.md §7, execution-plane.md §2, d-0021).
 *
 * Exports: Lane, Tier, TicketType, TicketStatus, TERMINAL_STATUSES, TicketRelationKind,
 *   Ticket.
 * Depends on: schemas/ids, zod. No IO.
 */

import { z } from 'zod';
import { TicketId } from '#/schemas/ids.js';

/** Process lane, lightest to heaviest (execution-plane.md §2). */
export const Lane = z.enum(['express', 'standard', 'full']);
export type Lane = z.infer<typeof Lane>;

/** Blast-radius tier A/B/C that decides who signs off (verification-plane.md). */
export const Tier = z.enum(['A', 'B', 'C']);
export type Tier = z.infer<typeof Tier>;

/** Conventional-commit style type, also the branch prefix (d-0021). */
export const TicketType = z.enum([
  'feat',
  'fix',
  'chore',
  'docs',
  'refactor',
  'test',
  'perf',
  'ci',
]);
export type TicketType = z.infer<typeof TicketType>;

/** Ticket states of the machine in director-core.md §4. */
export const TicketStatus = z.enum([
  'inbox',
  'planned',
  'in_progress',
  'blocked',
  'waiting_human',
  'verifying',
  'review',
  'needs_signoff',
  'done',
  'cancelled',
]);
export type TicketStatus = z.infer<typeof TicketStatus>;

/** Statuses no event can leave. */
export const TERMINAL_STATUSES: readonly TicketStatus[] = ['done', 'cancelled'];

/** Ticket relation kinds (director-core.md §3 `ticket_relations`; five kinds, see core README). */
export const TicketRelationKind = z.enum([
  'blocks',
  'depends_on',
  'related',
  'supersedes',
  'spawned_from',
]);
export type TicketRelationKind = z.infer<typeof TicketRelationKind>;

const Timestamp = z.iso.datetime();

/** The `tickets` row (director-core.md §3), snake_case for storage. */
export const Ticket = z.object({
  id: TicketId,
  project: z.string().min(1),
  title: z.string().min(1),
  body: z.string(),
  type: TicketType,
  lane: Lane,
  tier_predicted: Tier,
  tier_actual: Tier.optional(),
  status: TicketStatus,
  status_version: z.number().int().nonnegative(),
  rework_count: z.number().int().nonnegative(),
  blocked_reason: z.string().optional(),
  created_at: Timestamp,
  updated_at: Timestamp,
  parent: TicketId.optional(),
  blocked_by: z.array(TicketId),
});
export type Ticket = z.infer<typeof Ticket>;
