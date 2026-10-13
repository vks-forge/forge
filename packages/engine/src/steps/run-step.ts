/**
 * Runs one Director step with the model matrix, the spend cap and one validation retry.
 *
 * Why: every Director judgement (triage, dispatch_prompt, steer_reply) is a finite model
 *   call whose answer is held to a zod schema. A model that answers off-schema usually
 *   fixes itself when told what was wrong, so the step is retried once with the validation
 *   error in the input; after that the step is rejected and nothing is written
 *   (director-core.md §5, d-0032). A rejected step is also held off for a while so a
 *   failing model is not re-spent on every 10 s tick.
 *
 * Exports: runStep(), rejectStep(), isHeld(), hold().
 * Depends on: @forge/core (DirectorLLM port, StepName, StepError), types/engine-state. No IO of its own.
 */

import type { Result, StepError, StepName } from '@forge/core';
import type { ZodType } from 'zod';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** One step call plus up to `engine.step_retries` retries on `invalid_output`. */
export async function runStep<T>(
  ctx: EngineCtx,
  name: StepName,
  input: Record<string, unknown>,
  schema: ZodType<T>,
): Promise<Result<T, StepError>> {
  const { llm, config } = ctx.deps;
  const opts = {
    model: config.models.director[name],
    budgetUsd: config.engine.step_budget_usd,
  };

  let result = await llm.step(name, input, schema, opts);
  for (
    let i = 0;
    !result.ok &&
    result.error.kind === 'invalid_output' &&
    i < config.engine.step_retries;
    i++
  ) {
    result = await llm.step(
      name,
      { ...input, previous_error: result.error.message },
      schema,
      opts,
    );
  }

  return result;
}

/** True while `key` is held off (epoch ms clock of this tick). */
export function isHeld(ctx: EngineCtx, key: string): boolean {
  const h = ctx.state.holds.get(key);

  return h !== undefined && h.until > ctx.now;
}

/** Holds `key` off until `untilMs`, or one tick interval from now. */
export function hold(ctx: EngineCtx, key: string, untilMs?: number): void {
  ctx.state.holds.set(key, {
    until: untilMs ?? ctx.now + ctx.deps.config.engine.tick_interval_ms,
  });
}

/** Records a step that produced nothing usable: report, log, hold. No state is written. */
export function rejectStep(
  ctx: EngineCtx,
  name: StepName,
  ticketId: string,
  error: StepError,
): void {
  const reason = `${error.kind}: ${error.message}`;
  ctx.report.rejectedSteps.push({ step: name, ticketId, reason });
  ctx.deps.log?.('warn', `director step ${name} rejected for ${ticketId}`, { reason });
  const reset =
    error.retryNotBefore === undefined ? NaN : Date.parse(error.retryNotBefore);

  hold(ctx, `${name}:${ticketId}`, reset > ctx.now ? reset : undefined);
}
