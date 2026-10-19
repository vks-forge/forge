/**
 * Director config schema — the `director` section of the company and project settings.
 *
 * Why: how the Director plans is something the owner tunes without a code edit (code.md
 *   rule 9, d-0150): the step list of the planning flow, the playbooks that hold each step's
 *   method, the house rules appended to every step, whether the Director may approve a plan
 *   itself, how many questions it asks, the spend that triggers a warning, how much of the
 *   repository one step may read, and how long each step may run. These live in the versioned
 *   settings (defaults are built in, overrides stored), so every Director step can record
 *   the settings version it ran under. The safety rules are not in this section: the
 *   approval floor, the Tier C human, the tool-less approval step and the single doors are
 *   code, shown greyed in the UI, and no value here can switch them off. The `escalation`
 *   dials say how far the Director goes alone when a ticket waits (looks first, how sure it must
 *   be to answer a Worker itself, how often it retries a failure before asking); Tier C
 *   tickets, tools and logins are never the Director's to settle whatever they say. `sign_off`
 *   says up to which tier the Director may sign finished work itself (default B); tier C is not
 *   a value, and a project's override may only lower the company's.
 *   `pipelines` says whether the Director may adjust a ticket's own pipeline copy and when it proposes a change to a project's list.
 *
 * Exports: PlaybookId, DirectorPlaybook, ApprovalMode, DirectorGrillLimits, DirectorReadCaps, DirectorResearchCaps, DirectorMemorySettings,
 *   DirectorEscalation, DirectorSignOff, DirectorPipelines, DirectorConfig.
 * Depends on: schemas/director-flow, schemas/steps, zod. No IO.
 */

import { z } from 'zod';
import { DirectorFlow } from '#/schemas/director-flow.js';
import { StepName } from '#/schemas/steps.js';

const PosInt = z.number().int().positive();

export const PlaybookId = z.string().regex(/^[a-z][a-z0-9-]*$/);
export type PlaybookId = z.infer<typeof PlaybookId>;

/** A Forge-owned markdown method injected as text into the step that names it (d-0130). */
export const DirectorPlaybook = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});
export type DirectorPlaybook = z.infer<typeof DirectorPlaybook>;

/** `director_or_user`: the Director approves when the floor passes; `always_ask`: the owner always does. */
export const ApprovalMode = z.enum(['director_or_user', 'always_ask']);
export type ApprovalMode = z.infer<typeof ApprovalMode>;

export const DirectorGrillLimits = z.object({
  /** Questions asked in one grill round before the rest become assumptions. */
  max_questions_per_round: PosInt,
  /** Grill rounds (the first plus each Request changes) that may ask questions. */
  max_rounds: PosInt,
});
export type DirectorGrillLimits = z.infer<typeof DirectorGrillLimits>;

export const DirectorReadCaps = z.object({
  max_files: PosInt,
  max_bytes: PosInt,
});
export type DirectorReadCaps = z.infer<typeof DirectorReadCaps>;

/**
 * How a waiting ticket is handled before the owner sees it: with `director_first` false every
 * escalation goes straight to the owner; `answer_confidence` is the confidence at which the
 * Director may answer a Worker's question alone (with cited grounds, never on Tier C);
 * `max_director_retries` is how many times it may retry one ticket's failure cause itself.
 */
export const DirectorEscalation = z.object({
  director_first: z.boolean(),
  answer_confidence: z.number().min(0).max(1),
  max_director_retries: z.number().int().nonnegative(),
});
export type DirectorEscalation = z.infer<typeof DirectorEscalation>;

/**
 * How far the Director's own sign-off goes: the highest tier it may sign (`none` never signs).
 * Tier C is not a value because it always needs a named person; a project may only lower it.
 */
export const DirectorSignOff = z.object({ max_tier: z.enum(['none', 'A', 'B']) });
export type DirectorSignOff = z.infer<typeof DirectorSignOff>;

/**
 * How far the Director goes with ticket pipelines: `adjust` lets it change a ticket's own copy
 * (never the project's list); a proposal to change the project's list is made once the same change
 * was applied to `propose_after` tickets from `propose_min_cards` cards in `propose_window_days`.
 */
export const DirectorPipelines = z.object({
  adjust: z.boolean(),
  propose_after: z.number().int().min(2).max(10),
  propose_min_cards: z.number().int().min(1).max(5),
  propose_window_days: z.number().int().min(7).max(90),
});
export type DirectorPipelines = z.infer<typeof DirectorPipelines>;

/**
 * How much outside research one card may do (d-0144, d-0072): per research run, rounds of requests,
 * searches, fetches and page bytes; per card, runs. The ceilings are high on purpose (d-0171): search
 * and page reads cost nothing, only model spend is bounded, by the step budget. A cap stops the requests (the step sees "cap
 * reached"), never the card. `grill_detours` lets the grill pause for outside facts before a question;
 * `step_budget_usd` caps one research model call and defaults to the engine step budget.
 */
export const DirectorResearchCaps = z.object({
  max_rounds: z.number().int().min(1).max(10),
  max_searches: z.number().int().min(0).max(100),
  max_fetches: z.number().int().min(0).max(100),
  max_bytes: z.number().int().min(50_000).max(20_000_000),
  max_runs_per_card: z.number().int().min(1).max(100),
  grill_detours: z.boolean(),
  step_budget_usd: z.number().positive().optional(),
});
export type DirectorResearchCaps = z.infer<typeof DirectorResearchCaps>;

/**
 * How the Director reads project memory (d-0168): `rewrite` lets one cheap model call turn a free-text
 * question into key words and synonyms (card planning and card chat only), bounded by its own timeout and
 * budget and falling back to plain keywords; `top_k` relevant and up to `pinned_max` pinned decisions go into
 * a prompt; every rejected approach is always listed, up to `rejected_max`, and the rest are ranked.
 */
export const DirectorMemorySettings = z.object({
  rewrite: z.boolean(),
  rewrite_timeout_ms: z.number().int().min(1000).max(60_000),
  rewrite_budget_usd: z.number().min(0).max(2),
  top_k: z.number().int().min(1).max(15),
  pinned_max: z.number().int().min(0).max(25),
  rejected_max: z.number().int().min(5).max(50),
});
export type DirectorMemorySettings = z.infer<typeof DirectorMemorySettings>;

/** The whole section; a flow step may only name a playbook that exists. */
export const DirectorConfig = z
  .object({
    flow: DirectorFlow,
    playbooks: z.record(PlaybookId, DirectorPlaybook),
    house_rules: z.string(),
    approval_mode: ApprovalMode,
    grill: DirectorGrillLimits,
    /** A warning (never a block) once the card's spend, Director steps included, reaches this (d-0143). */
    budget_warning_usd: z.number().positive(),
    read_caps: DirectorReadCaps,
    research: DirectorResearchCaps,
    memory: DirectorMemorySettings,
    step_timeouts_ms: z.record(StepName, PosInt),
    escalation: DirectorEscalation,
    sign_off: DirectorSignOff,
    pipelines: DirectorPipelines,
  })
  .superRefine((d, ctx) => {
    for (const step of d.flow) {
      if (step.playbook_id !== undefined && d.playbooks[step.playbook_id] === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: `step ${step.id} names playbook ${step.playbook_id}, which does not exist`,
        });
      }
    }
  });
export type DirectorConfig = z.infer<typeof DirectorConfig>;
