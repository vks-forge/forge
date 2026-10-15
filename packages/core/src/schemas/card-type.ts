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
 * Exports: CardTypeIcon, CardAction, CardType, BUILTIN_CARD_TYPES.
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

export const CardType = z.object({
  name: CardTypeName,
  label: z.string().min(1),
  icon: CardTypeIcon,
  allowed_sources: z.array(CardSourceKind).min(1),
  actions: z.array(CardAction),
  /** True when tickets wait for the user to approve the Director's plan in the card. */
  plan_approval: z.boolean(),
  /** True when intake hands the card to triage right away; false types start talk-only. */
  tickets_on_intake: z.boolean(),
  /** A lane suggestion for triage; never overrides the pre-check or the user's hint. */
  default_lane: Lane.optional(),
});
export type CardType = z.infer<typeof CardType>;

/** The four types d-0106 starts with, in display order; migration 0019 seeds the same rows. */
export const BUILTIN_CARD_TYPES: readonly CardType[] = [
  {
    name: 'discussion',
    label: 'Discussion',
    icon: 'message-circle',
    allowed_sources: ['chat', 'github_issue'],
    actions: ['chat', 'convert', 'close'],
    plan_approval: false,
    tickets_on_intake: false,
  },
  {
    name: 'plan',
    label: 'Plan',
    icon: 'list-checks',
    allowed_sources: ['chat', 'github_issue'],
    actions: ['chat', 'approve_plan', 'convert', 'close'],
    plan_approval: true,
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
    plan_approval: false,
    tickets_on_intake: true,
  },
  {
    name: 'pr_issue',
    label: 'PR issue',
    icon: 'git-pull-request',
    allowed_sources: ['github_pr', 'webhook', 'chat'],
    actions: ['chat', 'convert', 'close'],
    plan_approval: false,
    tickets_on_intake: true,
  },
];
