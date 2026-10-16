/**
 * CardType schema — one entry of the card type registry.
 *
 * Why: Discussion, Plan, Issue and PR issue differ only in what the Card page offers and
 *   whether tickets start at intake or after the user approves a plan (d-0106). Hard-coding
 *   that in the engine would mean a code change for every future type (Epic, Incident,
 *   Spike). Each type is a data row instead: the engine asks the registry whether to create
 *   tickets at intake, the UI asks which actions to show, and intake refuses a source a type
 *   does not allow. Rows are seeded by migration and later edited through the settings UI,
 *   never by hand (code.md rule 9).
 *
 *   `plan_approval` says who may approve a card's plan: the Director behind the deterministic
 *   floor, or only the owner (d-0141, item 6). Tickets no longer start at intake for Plan or
 *   Issue cards: the Director plans first (d-0128); only the PR fast path keeps them.
 *
 * Exports: CardTypeIcon, CardAction, PlanApproval, CardType, BUILTIN_CARD_TYPES.
 * Depends on: schemas/card, schemas/ticket, zod. No IO.
 */

import { z } from 'zod';
import { CardSourceKind, CardTypeName } from '#/schemas/card.js';
import { Lane } from '#/schemas/ticket.js';

/** An icon name the UI maps to a glyph; the registry holds a name, not an asset. */
export const CardTypeIcon = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);
export type CardTypeIcon = z.infer<typeof CardTypeIcon>;

/** An action the Card page offers (`chat`, `approve_plan`, `convert`, `close`); open, new types may name new actions. */
export const CardAction = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);
export type CardAction = z.infer<typeof CardAction>;

/** Who approves a plan: `director_or_user` lets the Director approve behind the floor, `user` always asks the owner. */
export const PlanApproval = z.enum(['director_or_user', 'user']);
export type PlanApproval = z.infer<typeof PlanApproval>;

export const CardType = z.object({
  name: CardTypeName,
  label: z.string().min(1),
  icon: CardTypeIcon,
  allowed_sources: z.array(CardSourceKind).min(1),
  actions: z.array(CardAction),
  /** Who may approve the Director's plan before tickets exist. */
  plan_approval: PlanApproval,
  /** True when intake files an inbox ticket at once (the PR fast path); false types plan first. */
  tickets_on_intake: z.boolean(),
  /** A lane suggestion for triage; never overrides the pre-check or the user's hint. */
  default_lane: Lane.optional(),
});
export type CardType = z.infer<typeof CardType>;

/** The four types d-0106 starts with, in display order; migrations 0019 and 0021 seed the same rows. */
export const BUILTIN_CARD_TYPES: readonly CardType[] = [
  {
    name: 'discussion',
    label: 'Discussion',
    icon: 'message-circle',
    allowed_sources: ['chat', 'github_issue'],
    actions: ['chat', 'convert', 'close'],
    plan_approval: 'user',
    tickets_on_intake: false,
  },
  {
    name: 'plan',
    label: 'Plan',
    icon: 'list-checks',
    allowed_sources: ['chat', 'github_issue'],
    actions: ['chat', 'approve_plan', 'convert', 'close'],
    plan_approval: 'director_or_user',
    tickets_on_intake: false,
  },
  {
    name: 'issue',
    label: 'Issue',
    icon: 'circle-dot',
    allowed_sources: [
      'chat',
      'github_issue',
      'webhook',
      'cron',
      'telemetry',
      'bug_report',
      'legacy',
    ],
    actions: ['chat', 'convert', 'close'],
    plan_approval: 'director_or_user',
    tickets_on_intake: false,
  },
  {
    name: 'pr_issue',
    label: 'PR issue',
    icon: 'git-pull-request',
    allowed_sources: ['github_pr', 'webhook', 'chat'],
    actions: ['chat', 'convert', 'close'],
    plan_approval: 'user',
    tickets_on_intake: true,
  },
];
