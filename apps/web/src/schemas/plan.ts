/**
 * Response schemas for a card's plan: its versions, the plan itself and the floor result.
 *
 * Why: the Plan tab is where the owner decides whether the Director's plan becomes tickets, so
 *   what it shows must be exactly what the server stored (d-0132). The plan has a fixed
 *   structure; every list defaults to empty so a plan missing a section still draws the other
 *   sections instead of failing the tab. The floor result is a loose shape on purpose (a pass
 *   flag and reasons); the UI shows reasons as text and treats anything it cannot read as
 *   "no floor result" rather than guessing a verdict.
 *
 * Exports: PlanPriority, PlanLane, PlanTicket, PlanVerification, PlanOverlap, PlanChange,
 *   PlanVersion, PlanVersionRef, FloorResult, PlanReply, PlanVersionReply, PlanApproveReply
 *   (schemas and inferred types).
 * Depends on: @forge/core (PlanPipeline, EvidenceView, EvidenceRef), zod.
 */

import { EvidenceRef, EvidenceView, PlanPipeline } from '@forge/core';
import { z } from 'zod';

export const PlanPriority = z.enum(['low', 'normal', 'high', 'urgent']);
export type PlanPriority = z.infer<typeof PlanPriority>;

export const PlanLane = z.enum(['express', 'standard', 'full']);
export type PlanLane = z.infer<typeof PlanLane>;

export const PlanTicket = z.object({
  key: z.string().min(1),
  title: z.string(),
  body: z.string().default(''),
  acceptance: z.array(z.string()).default([]),
  priority: PlanPriority.default('normal'),
  depends_on: z.array(z.string()).default([]),
  lane: PlanLane.default('standard'),
  /** True when the owner chose this lane; the automatic size checks then leave it alone (protected files still run in Full). */
  lane_by_owner: z.boolean().optional(),
  size: z.enum(['S', 'M', 'L']).default('M'),
  files: z.array(z.string()).default([]),
  /** The Director's changes to this ticket's own copy of its lane, each with a reason; absent when it made none. */
  pipeline: PlanPipeline.optional(),
});
export type PlanTicket = z.infer<typeof PlanTicket>;

export const PlanOverlap = z.object({
  card_id: z.string().optional(),
  ticket_id: z.string().optional(),
  files: z.array(z.string()).default([]),
});
export type PlanOverlap = z.infer<typeof PlanOverlap>;

export const PlanVerification = z.object({
  blast_radius: z.string().default(''),
  files_read: z.array(z.string()).default([]),
  overlaps: z.array(PlanOverlap).default([]),
  matching_decisions: z.array(z.string()).default([]),
  rejected_hits: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  /** The card's checked research evidence; a plan stored before research existed has none. */
  evidence: z.array(EvidenceView).default([]),
  /** The outside facts the plan rests on, each marked supported or unverified by the engine. */
  outside_claims: z
    .array(
      z.object({
        claim: z.string(),
        evidence: z.array(EvidenceRef).default([]),
        status: z.enum(['supported', 'unverified']).catch('unverified'),
      }),
    )
    .default([]),
});
export type PlanVerification = z.infer<typeof PlanVerification>;

export const PlanChange = z.object({
  field: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});
export type PlanChange = z.infer<typeof PlanChange>;

export const PlanVersion = z.object({
  card_id: z.string(),
  version: z.number().int().positive(),
  created_at: z.string(),
  author: z.string().default('director'),
  goal: z.string().default(''),
  scope: z.array(z.string()).default([]),
  non_goals: z.array(z.string()).default([]),
  decisions: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
  assumptions: z.array(z.string()).default([]),
  verification: PlanVerification.default(() => PlanVerification.parse({})),
  tickets: z.array(PlanTicket).default([]),
  card_links: z.array(z.string()).default([]),
  diff_from_previous: z.array(PlanChange).optional(),
});
export type PlanVersion = z.infer<typeof PlanVersion>;

export const PlanVersionRef = z.object({
  version: z.number().int().positive(),
  created_at: z.string(),
});
export type PlanVersionRef = z.infer<typeof PlanVersionRef>;

/** A floor verdict as far as the UI reads it: pass or fail plus the reasons. */
export const FloorResult = z
  .object({
    pass: z.boolean().optional(),
    passed: z.boolean().optional(),
    ok: z.boolean().optional(),
    reasons: z.array(z.string()).default([]),
  })
  .transform((raw) => ({
    pass: raw.pass ?? raw.passed ?? raw.ok ?? raw.reasons.length === 0,
    reasons: raw.reasons,
  }));
export type FloorResult = z.infer<typeof FloorResult>;

/** A ticket that approving the current plan would cancel. */
export const PlanImpactTicket = z.object({ id: z.string(), title: z.string() });
export type PlanImpactTicket = z.infer<typeof PlanImpactTicket>;

/** `GET /cards/:id/plan`. */
export const PlanReply = z.object({
  versions: z.array(PlanVersionRef).default([]),
  current: PlanVersion.nullable().default(null),
  floor: FloorResult.nullable().catch(null).default(null),
  /** When the floor was last computed, for a plan already approved (the floor is then frozen and `floor` is null). */
  floor_frozen_at: z.iso.datetime().nullable().catch(null).default(null),
  /** Tickets approval would cancel, and the ones of those the plan does not cover (older servers send neither). */
  will_cancel: z.array(PlanImpactTicket).catch([]).default([]),
  not_covered: z.array(PlanImpactTicket).catch([]).default([]),
  /** Kept tickets whose plan key the plan reuses for a new ticket. */
  already_exists: z.array(PlanImpactTicket).catch([]).default([]),
});
export type PlanReply = z.infer<typeof PlanReply>;

/** `GET /cards/:id/plan/:version` and the answer of the ticket-edit `PATCH`. */
export const PlanVersionReply = z.object({ plan: PlanVersion });
export type PlanVersionReply = z.infer<typeof PlanVersionReply>;

/** `POST /cards/:id/plan/approve`. */
export const PlanApproveReply = z.object({
  ticket_ids: z.array(z.string()).default([]),
});
export type PlanApproveReply = z.infer<typeof PlanApproveReply>;
