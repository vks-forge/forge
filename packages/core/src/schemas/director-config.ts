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
 *   code, shown greyed in the UI, and no value here can switch them off.
 *
 * Exports: PlaybookId, DirectorPlaybook, ApprovalMode, DirectorGrillLimits, DirectorReadCaps,
 *   DirectorConfig.
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
    step_timeouts_ms: z.record(StepName, PosInt),
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
