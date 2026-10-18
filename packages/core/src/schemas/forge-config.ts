/**
 * Forge config schemas — model matrix and engine limits (`.forge/config/forge.yaml`).
 *
 * Why: which model runs each Director step and each Worker lane, how many Workers run at
 *   once, when a silent run counts as stalled and how failures are retried are dials the
 *   owner changes without a code edit (code.md rule 9, d-0060). They are validated when the
 *   file loads, so a typo or a tick interval of 1 s fails at startup with a readable error
 *   instead of hammering the harness mid-ticket. Core only defines the shapes; reading the
 *   file is the app's job (no IO here).
 *
 * Exports: ModelMatrix, RetryPolicy, EngineConfig, ForgeConfig.
 * Depends on: schemas/agent, schemas/director-config, schemas/pipeline, schemas/ticket, zod. No IO.
 */

import { z } from 'zod';
import { AgentsRecord } from '#/schemas/agent.js';
import { DirectorConfig } from '#/schemas/director-config.js';
import { LanePipelines } from '#/schemas/pipeline.js';
import { TicketStatus } from '#/schemas/ticket.js';

const Model = z.string().min(1);
const PosInt = z.number().int().positive();

/** Role x lane -> model; Director steps are keyed by step name, Workers by lane (d-0060). */
export const ModelMatrix = z.object({
  director: z.object({
    triage: Model,
    dispatch_prompt: Model,
    steer_reply: Model,
    card_chat: Model,
    card_survey: Model,
    grill_turn: Model,
    verify: Model,
    enhance: Model,
    write_plan: Model,
    approve_plan: Model,
    custom_step: Model,
    ticket_answer: Model,
    ticket_recover: Model,
    draft_agent: Model,
    ticket_check: Model,
    pick_substitute: Model,
  }),
  worker: z.object({ express: Model, standard: Model, full: Model }),
});
export type ModelMatrix = z.infer<typeof ModelMatrix>;

/**
 * Per-family retry table (execution-plane.md §8). `rate_limit` backs off exponentially
 * and honours the harness's `retryNotBefore`; `crash`, `stall` and `unknown` retry a few
 * times with a fixed delay. `quota` is not retried by this
 * table: the harness is parked until its reset time instead (d-0097). `auth`, `policy_denied`,
 * `refusal`, `budget` and `invalid_input` are never retried automatically (they go to a human), so they have no
 * knob: relaxing them is a code decision, not a config one.
 */
export const RetryPolicy = z.object({
  rate_limit: z.object({ base_ms: PosInt, max_ms: PosInt, max_attempts: PosInt }),
  crash: z.object({ delay_ms: PosInt, max_attempts: PosInt }),
  stall: z.object({ delay_ms: PosInt, max_attempts: PosInt }),
  unknown: z.object({ delay_ms: PosInt, max_attempts: PosInt }),
});
export type RetryPolicy = z.infer<typeof RetryPolicy>;

/** Engine tick cadence and limits (director-core.md §2-§3). */
export const EngineConfig = z.object({
  tick_interval_ms: z.number().int().min(10_000),
  /** Workers running at once on this machine (d-0097). Stored documents may still say `global_slots`; see `migrateLegacyCompanyDoc`. */
  max_concurrent_global: PosInt,
  /** Workers running at once in one project; a project may lower its own with `max_concurrent`. */
  max_concurrent_per_project: PosInt,
  /** Workers running at once on one harness: `default` unless `by_id` names the harness. */
  max_concurrent_per_harness: z.object({
    default: PosInt,
    by_id: z.record(z.string().min(1), PosInt),
  }),
  max_concurrent_by_state: z.partialRecord(TicketStatus, PosInt),
  stall_ms: PosInt,
  rewake_cap: z.object({ max: PosInt, window_ms: PosInt }),
  step_retries: z.number().int().nonnegative(),
  step_budget_usd: z.number().positive(),
  confidence_threshold: z.number().min(0).max(1),
  interaction_timeout_ms: PosInt,
  run_budget: z.object({
    max_turns: PosInt,
    max_usd: z.number().positive(),
    turn_ms: PosInt,
  }),
  retry: RetryPolicy,
  /** How long a harness waits after a quota error that named no reset time (d-0097). */
  quota_default_pause_ms: PosInt,
  /** Harnesses to try, in order, when a ticket's own harness is out of quota (d-0080); empty means wait. */
  harness_fallbacks: z.array(z.string().min(1)),
  /** How long a graceful stop waits for tool calls already running to record their effect before runs are interrupted; 0 interrupts at once. Bounded by half the shutdown grace window. */
  shutdown_drain_ms: z.number().int().nonnegative(),
});
export type EngineConfig = z.infer<typeof EngineConfig>;

/** The whole file: the model matrix, the engine limits, the Director's planning settings (d-0150), the agents and the lane pipelines. */
export const ForgeConfig = z.object({
  models: ModelMatrix,
  engine: EngineConfig,
  director: DirectorConfig,
  /** The company's agents: the built-ins merged with the owner's edits and custom agents (d-0147). */
  agents: AgentsRecord,
  /** The company's lane pipelines: the shipped lists with the owner's replacements (d-0151). */
  pipelines: LanePipelines,
});
export type ForgeConfig = z.infer<typeof ForgeConfig>;
