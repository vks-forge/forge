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
 * Depends on: schemas/ticket, zod. No IO.
 */

import { z } from 'zod';
import { TicketStatus } from '#/schemas/ticket.js';

const Model = z.string().min(1);
const PosInt = z.number().int().positive();

/** Role x lane -> model; Director steps are keyed by step name, Workers by lane (d-0060). */
export const ModelMatrix = z.object({
  director: z.object({ triage: Model, dispatch_prompt: Model, steer_reply: Model }),
  worker: z.object({ express: Model, standard: Model, full: Model }),
});
export type ModelMatrix = z.infer<typeof ModelMatrix>;

/**
 * Per-family retry table (execution-plane.md §8). `rate_limit` backs off exponentially
 * and honours the harness's `retryNotBefore`; `crash`, `stall` and `unknown` retry a few
 * times with a fixed delay. `auth`, `policy_denied`, `refusal`, `budget` and
 * `invalid_input` are never retried automatically (they go to a human), so they have no
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
  global_slots: PosInt,
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
});
export type EngineConfig = z.infer<typeof EngineConfig>;

/** The whole file. */
export const ForgeConfig = z.object({ models: ModelMatrix, engine: EngineConfig });
export type ForgeConfig = z.infer<typeof ForgeConfig>;
