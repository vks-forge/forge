/**
 * The Director settings the web reads and edits, and the reply schemas that tolerate a server
 * without them.
 *
 * Why: the Director page edits the `director` section of the company settings (flow, house
 *   rules, limits) and the per-step models. The shapes belong to `@forge/core`, so a field
 *   added there reaches the page; this file re-exports them under one roof and adds the one
 *   thing core does not need: an older server that has no `director` section or fewer
 *   per-step models must still load the Limits, General and project screens, so the
 *   settings replies are parsed leniently and filled with the same defaults the Director
 *   page shows as "Using built-in defaults". Saving then writes only what the owner changed,
 *   so the server fills the rest from its own built-ins.
 *
 * Exports: DirectorConfig, DirectorFlow, FlowStep, FlowStepKind, FlowWhen, FlowDepth,
 *   ApprovalMode, DirectorPlaybook, STEP_NAMES, StepName (core re-exports), CompanyConfigReply,
 *   EffectiveConfigReply, withDirectorDefaults().
 * Depends on: @forge/core, domain/director-defaults, zod.
 */

import {
  ApprovalMode,
  DirectorConfig,
  DirectorFlow,
  DirectorPlaybook,
  EngineConfig,
  FlowDepth,
  FlowStep,
  FlowStepKind,
  FlowWhen,
  ForgeConfig,
  ModelMatrix,
  ProjectSettings,
  STEP_NAMES,
  StepName,
} from '@forge/core';
import { z } from 'zod';
import { FALLBACK_DIRECTOR, FALLBACK_STEP_MODELS } from '#/domain/director-defaults.js';

export {
  ApprovalMode,
  DirectorConfig,
  DirectorFlow,
  DirectorPlaybook,
  FlowDepth,
  FlowStep,
  FlowStepKind,
  FlowWhen,
  STEP_NAMES,
  StepName,
};

/** `ForgeConfig` as an older server sends it: no `director`, and only the first four Director models. */
const LenientForgeConfig = z.object({
  models: z.object({
    director: ModelMatrix.shape.director.partial({
      card_survey: true,
      grill_turn: true,
      verify: true,
      enhance: true,
      write_plan: true,
      approve_plan: true,
      custom_step: true,
    }),
    worker: ModelMatrix.shape.worker,
  }),
  engine: EngineConfig,
  director: DirectorConfig.optional(),
});

type LenientForgeConfig = z.infer<typeof LenientForgeConfig>;

/** The full config, with built-in stand-ins for whatever an older server left out. */
export function withDirectorDefaults(raw: LenientForgeConfig): ForgeConfig {
  const d = raw.models.director;
  const fallback = FALLBACK_STEP_MODELS;

  return {
    models: {
      director: {
        triage: d.triage,
        dispatch_prompt: d.dispatch_prompt,
        steer_reply: d.steer_reply,
        card_chat: d.card_chat,
        card_survey: d.card_survey ?? fallback.card_survey,
        grill_turn: d.grill_turn ?? fallback.grill_turn,
        verify: d.verify ?? fallback.verify,
        enhance: d.enhance ?? fallback.enhance,
        write_plan: d.write_plan ?? fallback.write_plan,
        approve_plan: d.approve_plan ?? fallback.approve_plan,
        custom_step: d.custom_step ?? fallback.custom_step,
      },
      worker: raw.models.worker,
    },
    engine: raw.engine,
    director: raw.director ?? FALLBACK_DIRECTOR,
  };
}

/** `GET /settings/company`'s `{ config, version }`, with `serverHasDirector` false for an older server. */
export const CompanyConfigReply = z
  .object({ config: LenientForgeConfig, version: z.number().int().nonnegative() })
  .transform(({ config, version }) => ({
    config: withDirectorDefaults(config),
    version,
    serverHasDirector: config.director !== undefined,
  }));

/** `GET /settings/projects/:slug`'s effective config, tolerant in the same way. */
export const EffectiveConfigReply = z
  .object({ forge: LenientForgeConfig, project: ProjectSettings })
  .transform(({ forge, project }) => ({ forge: withDirectorDefaults(forge), project }));
