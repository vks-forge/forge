/**
 * Card schemas — the intake record, its Board column and its sources.
 *
 * Why: every request that reaches Forge (a chat message, a GitHub issue, a webhook) is
 *   one Card, the record of the intake that the Director triages into zero or more tickets
 *   (d-0105). The Board, the Card page, the Director's chat and GitHub sync all read the
 *   same row, so its fields and the closed set of Board columns are defined once here.
 *   The column is never stored: it is rolled up from the card's tickets and pending
 *   questions (domain/card-rollup), so the Board cannot disagree with the ticket state
 *   machine and nobody can drag a card to a column by hand (d-0107). A card's `type` is
 *   an open name looked up in the card type registry, not an enum, so new types are data
 *   (d-0106).
 *
 * Exports: CARD_COLUMNS, CardColumn, CARD_SOURCE_KINDS, CardSourceKind, CardSource,
 *   CardActorType, CardActor, CardTypeName, Card.
 * Depends on: schemas/ids, zod. No IO.
 */

import { z } from 'zod';
import { CardId } from '#/schemas/ids.js';

/** Board columns in display order (d-0107). `closed` is the only one set by an act, not derived. */
export const CARD_COLUMNS = [
  'new',
  'shaping',
  'needs_you',
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

/**
 * The `cards` row. `closed_reason` present means the card is Closed; absent means the column
 * is rolled up. `budget_cap_usd` caps the sum of the card's tickets' spend (d-0112), unset
 * until the project settings give a default.
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
});
export type Card = z.infer<typeof Card>;
