/**
 * Card schemas — the intake record, its Board column and its sources.
 *
 * Why: every request that reaches Forge (a chat message, a GitHub issue, a webhook) is
 *   one Card, the record of the intake that the Director triages into zero or more tickets
 *   (d-0105). The Board, the Card page, the Director's chat and GitHub sync all read the
 *   same row, so its fields and the closed set of Board columns are defined once here.
 *   A card now carries its own stored `phase` (grilling to done, d-0134), moved only by
 *   `transitionCard()` with a CAS `phase_version`, plus a `needs_you` flag for "the Director
 *   waits on the owner". The Board column is still never stored: it is rolled up from the
 *   phase, the flag and the card's tickets and questions (domain/card-rollup, d-0139), so
 *   nobody can drag a card to a column by hand. A card's `type` is an open name looked up
 *   in the card type registry, not an enum, so new types are data (d-0106). Dependencies
 *   between cards are `CardRelation` edges (d-0141), kept in their own table, not on the row.
 *
 * Exports: CARD_PHASES, CardPhase, CARD_PRIORITIES, CardPriority, CARD_COLUMNS, CardColumn,
 *   CARD_SOURCE_KINDS, CardSourceKind, CardSource, CardActorType, CardActor, CardTypeName,
 *   CardRelation, Card.
 * Depends on: schemas/ids, zod. No IO.
 */

import { z } from 'zod';
import { CardId } from '#/schemas/ids.js';

/** Where a card is in its life, in order (d-0134). Stored; changed only through `transitionCard()`. */
export const CARD_PHASES = [
  'grilling',
  'verifying',
  'plan_ready',
  'approved',
  'queued',
  'in_progress',
  'done',
  'closed',
] as const;
export const CardPhase = z.enum(CARD_PHASES);
export type CardPhase = z.infer<typeof CardPhase>;

/** How urgent a card is; it orders the card's tickets in the queue and cards within a column (d-0138). */
export const CARD_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const CardPriority = z.enum(CARD_PRIORITIES);
export type CardPriority = z.infer<typeof CardPriority>;

/** Board columns in display order (d-0139). Derived from the phase and `needs_you`, never stored. */
export const CARD_COLUMNS = [
  'shaping',
  'needs_you',
  'queued',
  'in_progress',
  'done',
  'closed',
] as const;
export const CardColumn = z.enum(CARD_COLUMNS);
export type CardColumn = z.infer<typeof CardColumn>;

/** Where an intake came from; the intake sources plus the PR source and `legacy` for backfilled tickets. */
export const CARD_SOURCE_KINDS = [
  'chat',
  'github_issue',
  'github_pr',
  'webhook',
  'cron',
  'telemetry',
  'bug_report',
  'legacy',
] as const;
export const CardSourceKind = z.enum(CARD_SOURCE_KINDS);
export type CardSourceKind = z.infer<typeof CardSourceKind>;

/** The source kind and a reference a person can follow (chat message key, issue URL or number). */
export const CardSource = z.object({
  kind: CardSourceKind,
  ref: z.string().min(1),
});
export type CardSource = z.infer<typeof CardSource>;

/** Who did something on a card (d-0112: every card action is logged with its actor). */
export const CardActorType = z.enum(['user', 'director', 'github', 'system', 'external']);
export type CardActorType = z.infer<typeof CardActorType>;

export const CardActor = z.object({
  type: CardActorType,
  id: z.string().min(1),
});
export type CardActor = z.infer<typeof CardActor>;

/** A card type name from the registry: lowercase snake case (`discussion`, `pr_issue`). */
export const CardTypeName = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);
export type CardTypeName = z.infer<typeof CardTypeName>;

const Timestamp = z.iso.datetime();

/** One `from` depends on `to` edge between two cards of the same project (the reverse view is "blocks"). */
export const CardRelation = z.object({
  from: CardId,
  to: CardId,
  kind: z.literal('depends_on'),
});
export type CardRelation = z.infer<typeof CardRelation>;

/**
 * The `cards` row. `phase` and `phase_version` are the stored lifecycle (CAS on the version);
 * `needs_you` is true while the card itself waits on the owner (a ticket waiting on a person
 * is rolled up on top of it when the card is read). `closed_reason` present means the card
 * is Closed. `budget_cap_usd` is a warning threshold for the sum of the card's spend
 * (d-0112, d-0143), never a block, unset until the project settings give a default.
 */
export const Card = z.object({
  id: CardId,
  project: z.string().min(1),
  type: CardTypeName,
  title: z.string().min(1),
  summary: z.string(),
  source: CardSource,
  created_by: CardActor,
  created_at: Timestamp,
  updated_at: Timestamp,
  closed_reason: z.string().min(1).optional(),
  budget_cap_usd: z.number().nonnegative().optional(),
  phase: CardPhase,
  phase_version: z.number().int().nonnegative(),
  needs_you: z.boolean(),
  priority: CardPriority,
  /** http(s) URLs the Director reads as context. */
  links: z.array(z.url({ protocol: /^https?$/ })),
});
export type Card = z.infer<typeof Card>;
