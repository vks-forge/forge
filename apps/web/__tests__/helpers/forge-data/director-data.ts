/**
 * Test data for the Director screens: built-in Director settings and an older server's reply.
 *
 * Why: the Director page edits a `director` section whose shipped defaults live in core, and
 *   an older server sends none at all. The stub server must answer both ways, using core's own
 *   schemas so a shape that drifts fails loudly here. The stub always uses the sample
 *   below (same shape as core's built-ins, two short playbooks) so test wording does not move
 *   when a shipped label does; one test checks core's real built-ins separately.
 *
 * Exports: BUILTIN_WITH_DIRECTOR, BUILTIN_FORGE_WITH_DIRECTOR, directorSample(), legacyCompanyBody().
 * Depends on: @forge/core, schemas/director-config.
 */

import { BUILTIN_CONFIG, DirectorConfig, ForgeConfig } from '@forge/core';
import type { EffectiveConfig } from '@forge/core';
import { FALLBACK_DIRECTOR, FALLBACK_STEP_MODELS } from '#/domain/director-defaults.js';

/** Built-in Director settings with two sample playbooks the default flow names. */
export function directorSample(): DirectorConfig {
  return DirectorConfig.parse({
    ...FALLBACK_DIRECTOR,
    playbooks: {
      'plan-grill': {
        title: 'Grill the owner',
        body: '# Grill\n\nAsk one question at a time.\nOffer two to four options.',
      },
      'write-plan': {
        title: 'Write the plan',
        body: '# Write the plan\n\nGoal, scope, decisions, tickets.',
      },
    },
    flow: FALLBACK_DIRECTOR.flow.map((step) =>
      step.kind === 'grill'
        ? { ...step, playbook_id: 'plan-grill' }
        : step.kind === 'write_plan'
          ? { ...step, playbook_id: 'write-plan' }
          : step,
    ),
  });
}

const builtinForge = BUILTIN_CONFIG.forge as Partial<ForgeConfig> & {
  models: { director: Record<string, string> };
};

/** Core's built-in company settings, with the Director section and per-step models filled in when core lacks them. */
export const BUILTIN_FORGE_WITH_DIRECTOR: ForgeConfig = ForgeConfig.parse({
  ...builtinForge,
  models: {
    ...builtinForge.models,
    director: { ...FALLBACK_STEP_MODELS, ...builtinForge.models.director },
  },
  // Always the sample, never core's built-ins, so test wording does not move when a shipped label does.
  director: directorSample(),
});

export const BUILTIN_WITH_DIRECTOR: EffectiveConfig = {
  forge: BUILTIN_FORGE_WITH_DIRECTOR,
  project: BUILTIN_CONFIG.project,
};

/** What an older server answers for `GET /settings/company`: no `director`, only the first four Director models. */
export function legacyCompanyBody(version = 0): {
  config: Record<string, unknown>;
  version: number;
} {
  const rest = Object.fromEntries(
    Object.entries(BUILTIN_FORGE_WITH_DIRECTOR).filter(([key]) => key !== 'director'),
  ) as Omit<ForgeConfig, 'director'>;

  const { triage, dispatch_prompt, steer_reply, card_chat } =
    BUILTIN_FORGE_WITH_DIRECTOR.models.director;

  return {
    config: {
      ...rest,
      models: {
        ...rest.models,
        director: { triage, dispatch_prompt, steer_reply, card_chat },
      },
    },
    version,
  };
}
