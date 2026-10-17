/**
 * Built-in config defaults — the settings Forge runs on before anyone saves a change.
 *
 * Why: settings live in the database as overrides (d-0085), so a fresh install has no
 *   rows. Something must answer "what is the tick interval" on first boot, and it must be
 *   code the release ships, not a file the user is expected to edit (d-0090). These are
 *   the values `.forge/config/forge.yaml` carried before settings moved to the database;
 *   a test keeps the two equal until the file is retired. A later release can change a
 *   default and every install that never overrode it picks it up.
 *
 * Exports: BUILTIN_FORGE_CONFIG, BUILTIN_PROJECT_SETTINGS, BUILTIN_CONFIG.
 * Depends on: domain/builtin-agents, domain/builtin-director, schemas/config-override, schemas/forge-config. No IO.
 */

import { BUILTIN_AGENTS } from '#/domain/builtin-agents.js';
import { BUILTIN_DIRECTOR_CONFIG } from '#/domain/builtin-director.js';
import type { EffectiveConfig, ProjectSettings } from '#/schemas/config-override.js';
import type { ForgeConfig } from '#/schemas/forge-config.js';

export const BUILTIN_FORGE_CONFIG: ForgeConfig = {
  models: {
    // Director LLM steps run on the logged-in harness subscription (d-0032).
    director: {
      triage: 'opus',
      dispatch_prompt: 'opus',
      steer_reply: 'opus',
      card_chat: 'opus',
      // Planning steps (d-0150): the judging steps on opus, the quick turns on sonnet.
      card_survey: 'opus',
      grill_turn: 'sonnet',
      verify: 'opus',
      enhance: 'opus',
      write_plan: 'opus',
      approve_plan: 'opus',
      custom_step: 'sonnet',
      // Escalation steps (d-0141 item 8): answering a Worker is a quick turn, diagnosing a failure is judging.
      ticket_answer: 'sonnet',
      ticket_recover: 'opus',
      // Drafting an agent from a description is one quick structured answer.
      draft_agent: 'sonnet',
    },
    worker: { express: 'sonnet', standard: 'sonnet', full: 'sonnet' },
  },
  engine: {
    tick_interval_ms: 30_000,
    // Layered Worker limits (d-0097): 2 at once overall, 1 per project, 2 per harness.
    max_concurrent_global: 2,
    max_concurrent_per_project: 1,
    max_concurrent_per_harness: { default: 2, by_id: {} },
    max_concurrent_by_state: { in_progress: 3, verifying: 1 },
    stall_ms: 300_000,
    rewake_cap: { max: 3, window_ms: 3_600_000 },
    step_retries: 1,
    // The claude CLI's own system prompt and cache write cost about $0.50 per call on opus, so
    // a planning step needs headroom well above that or it can never finish.
    step_budget_usd: 2,
    confidence_threshold: 0.7,
    interaction_timeout_ms: 14_400_000,
    run_budget: { max_turns: 40, max_usd: 5, turn_ms: 600_000 },
    retry: {
      rate_limit: { base_ms: 60_000, max_ms: 3_600_000, max_attempts: 5 },
      crash: { delay_ms: 10_000, max_attempts: 1 },
      stall: { delay_ms: 10_000, max_attempts: 2 },
      unknown: { delay_ms: 30_000, max_attempts: 1 },
    },
    quota_default_pause_ms: 3_600_000,
    harness_fallbacks: [],
    shutdown_drain_ms: 10_000,
  },
  director: BUILTIN_DIRECTOR_CONFIG,
  agents: { ...BUILTIN_AGENTS },
};

/** What a project gets until it overrides: no checks (any role may be absent), no ecosystems (the gates detect them), the safe Tier C set. */
export const BUILTIN_PROJECT_SETTINGS: ProjectSettings = {
  checks: [],
  ecosystems: [],
  default_harness: 'claude-code',
  tier_c_globs: ['.forge/**', '.claude/**', '.github/**'],
};

export const BUILTIN_CONFIG: EffectiveConfig = {
  forge: BUILTIN_FORGE_CONFIG,
  project: BUILTIN_PROJECT_SETTINGS,
};
