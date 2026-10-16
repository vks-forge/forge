/**
 * Plan schemas — the versioned plan a card is approved by, and the approval floor's answer.
 *
 * Why: nothing is built before the owner, or the Director behind a deterministic floor,
 *   approves a plan (d-0132, d-0133). The plan has one fixed structure (goal, scope,
 *   decisions, assumptions, verification, ordered tickets, card links) so every plan reads
 *   the same and a version can be compared with the one before it. Each revision is kept as
 *   its own version with the diff from the last, and records which config version and which
 *   commit it was verified against, so "was this plan checked against the code as it is now"
 *   has a stored answer. Tickets are written with keys (`t1`, `t2`) and `depends_on` between
 *   keys; the refinement rejects a duplicate key, an unknown or self dependency and a loop,
 *   so approving a stored plan can never produce a ticket graph that deadlocks.
 *
 * Exports: PLAN_TICKET_SIZES, PlanTicket, PlanTickets, PlanVerification, PlanOverlap,
 *   PlanDiffEntry, PlanVersion, PlanVersionRef, FloorResult.
 * Depends on: schemas/card, schemas/ids, schemas/ticket, domain/graph-cycle, zod. No IO.
 */

import { z } from 'zod';
import { findCycle } from '#/domain/graph-cycle.js';
import { CardPriority } from '#/schemas/card.js';
import { CardId, TicketId } from '#/schemas/ids.js';
import { Lane } from '#/schemas/ticket.js';

export const PLAN_TICKET_SIZES = ['S', 'M', 'L'] as const;

const Key = z.string().regex(/^t[1-9][0-9]*$/);

/** One planned ticket; `depends_on` names the keys of other tickets of the same plan. */
export const PlanTicket = z.object({
  key: Key,
  title: z.string().trim().min(1).max(120),
  body: z.string().min(1),
  acceptance: z.array(z.string().min(1)),
  priority: CardPriority,
  depends_on: z.array(Key),
  lane: Lane,
  size: z.enum(PLAN_TICKET_SIZES),
  files: z.array(z.string().min(1)),
});
export type PlanTicket = z.infer<typeof PlanTicket>;

/** The ticket list with unique keys and a dependency graph that exists and has no loop. */
export const PlanTickets = z.array(PlanTicket).superRefine((tickets, ctx) => {
  const keys = new Set(tickets.map((t) => t.key));
  if (keys.size !== tickets.length) {
    ctx.addIssue({ code: 'custom', message: 'ticket keys must be unique' });
  }

  for (const t of tickets) {
    for (const dep of t.depends_on) {
      if (!keys.has(dep) || dep === t.key) {
        ctx.addIssue({
          code: 'custom',
          message: `ticket ${t.key} depends on ${dep}, which is not another ticket of this plan`,
        });
      }
    }
  }

  const edges = tickets.flatMap((t) => t.depends_on.map((to) => ({ from: t.key, to })));
  if (findCycle([], edges)) {
    ctx.addIssue({ code: 'custom', message: 'ticket dependencies form a loop' });
  }
});

/** Another card or ticket whose planned files overlap this plan's. */
export const PlanOverlap = z.object({
  card_id: CardId.optional(),
  ticket_id: TicketId.optional(),
  files: z.array(z.string().min(1)),
});
export type PlanOverlap = z.infer<typeof PlanOverlap>;

/** What verification found, with the files the Director read as evidence. */
export const PlanVerification = z.object({
  blast_radius: z.string(),
  files_read: z.array(z.string()),
  overlaps: z.array(PlanOverlap),
  matching_decisions: z.array(z.string()),
  rejected_hits: z.array(z.string()),
  risks: z.array(z.string()),
});
export type PlanVerification = z.infer<typeof PlanVerification>;

/** One changed field between two versions; per-ticket changes are `tickets.<key>`. */
export const PlanDiffEntry = z.object({
  field: z.string().min(1),
  before: z.unknown(),
  after: z.unknown(),
});
export type PlanDiffEntry = z.infer<typeof PlanDiffEntry>;

/** One stored plan version of a card (d-0132's fixed structure). */
export const PlanVersion = z.object({
  card_id: CardId,
  version: z.number().int().positive(),
  created_at: z.iso.datetime(),
  /** `director` wrote it; `owner` is a light ticket edit of a ready plan. */
  author: z.enum(['director', 'owner']),
  /** The effective config revision (company version plus project version) the plan was written under. */
  config_version: z.number().int().nonnegative(),
  /** HEAD when the plan was verified; the floor refuses a plan whose files moved since. */
  base_sha: z.string(),
  goal: z.string().min(1),
  scope: z.array(z.string()),
  non_goals: z.array(z.string()),
  decisions: z.array(z.object({ question: z.string(), answer: z.string() })),
  assumptions: z.array(z.string()),
  verification: PlanVerification,
  tickets: PlanTickets,
  card_links: z.array(CardId),
  /** Markdown of the enhance pass, kept with the version (d-0140). */
  enhance_report: z.string(),
  diff_from_previous: z.array(PlanDiffEntry).optional(),
});
export type PlanVersion = z.infer<typeof PlanVersion>;

/** The version list entry the plan reads return. */
export const PlanVersionRef = z.object({
  version: z.number().int().positive(),
  created_at: z.iso.datetime(),
});
export type PlanVersionRef = z.infer<typeof PlanVersionRef>;

/** The deterministic approval floor's answer: it can only make approval stricter (d-0141 item 6). */
export const FloorResult = z.object({
  pass: z.boolean(),
  reasons: z.array(z.string()),
});
export type FloorResult = z.infer<typeof FloorResult>;
