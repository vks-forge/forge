/**
 * Builds the driver request for one Worker run.
 *
 * Why: a run is started in two places that must agree on everything but a few fields: the
 *   dispatch of a new or retried run, and the resume of a run a restart interrupted (d-0092).
 *   Both hand the harness the same model for the lane, the same budget, the same MCP identity
 *   and the same environment shape (the bearer token and the ticket id). Building the request
 *   once means a settings change (budget, model matrix) reaches both paths, and a resume can
 *   never run under looser limits than the first start.
 *
 * Exports: buildRunRequest().
 * Depends on: @forge/core (RunRequest), types/engine-state, types/tick. No IO.
 */

import type { RunRequest } from '@forge/core';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { RunRequestInput } from '#/types/tick.types.js';

/** The request for `input`, with model and budget taken from this tick's settings. */
export function buildRunRequest(ctx: EngineCtx, input: RunRequestInput): RunRequest {
  const { forge } = ctx.config;
  const b = forge.engine.run_budget;
  const { ticket } = input;

  return {
    runId: input.runId,
    projectId: ticket.project,
    lane: ticket.lane,
    promptHash: input.promptHash,
    mcpIdentity: ctx.deps.mcpIdentity ?? 'forge',
    ticketId: ticket.id,
    cwd: input.cwd,
    prompt: input.prompt,
    model: forge.models.worker[ticket.lane],
    budget: {
      maxTurns: b.max_turns,
      maxUsd: b.max_usd,
      stallMs: forge.engine.stall_ms,
      turnMs: b.turn_ms,
    },
    ...(input.resume ? { resume: input.resume } : {}),
    ...(input.generation === undefined ? {} : { generation: input.generation }),
    env: { FORGE_RUN_TOKEN: input.token, FORGE_TICKET: ticket.id },
    isolation: 'host',
  };
}
