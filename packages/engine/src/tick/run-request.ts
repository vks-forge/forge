/**
 * Builds the driver request for one Worker run.
 *
 * Why: a run is started in two places that must agree on everything but a few fields: the
 *   dispatch of a new or retried run, and the resume of a run a restart interrupted (d-0092).
 *   Both hand the harness the same model, the same budget, the same MCP identity and the same
 *   environment shape (the bearer token and the ticket id). The model and budget come from the
 *   run's agent: its own model choice (the lane matrix, the harness default or a named model)
 *   and its own budget keys, each falling back to the company run budget when the agent does
 *   not set one. Building the request once means a settings change reaches both paths, and a
 *   resume can never run under looser limits than the first start. The tool folders the worktree's
 *   setup created go first on the Worker's PATH, so it runs the project's own `pytest`, not another.
 *
 * Exports: buildRunRequest().
 * Depends on: @forge/core (RunRequest), tick/run-agent, types/engine-state, types/tick. No IO.
 */

import type { RunRequest } from '@forge/core';
import { modelFor } from '#/tick/run-agent.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { RunRequestInput } from '#/types/tick.types.js';

/** The request for `input`, with model and budget taken from this tick's settings. */
export function buildRunRequest(ctx: EngineCtx, input: RunRequestInput): RunRequest {
  const { forge } = ctx.config;
  const b = forge.engine.run_budget;
  const { ticket, agent } = input;
  const model = modelFor(
    ctx.config,
    agent,
    ticket.lane,
    input.harnessId ?? agent.harnessId,
  );

  const own = agent.definition.budget;
  if (own.minutes !== undefined) {
    ctx.deps.log?.(
      'info',
      `agent ${agent.id}: its minutes budget is not enforced by any driver yet`,
    );
  }

  return {
    runId: input.runId,
    projectId: ticket.project,
    lane: ticket.lane,
    promptHash: input.promptHash,
    mcpIdentity: ctx.deps.mcpIdentity ?? 'forge',
    ticketId: ticket.id,
    cwd: input.cwd,
    prompt: input.prompt,
    ...(model === undefined ? {} : { model }),
    budget: {
      maxTurns: own.turns ?? b.max_turns,
      maxUsd: own.usd ?? b.max_usd,
      stallMs: forge.engine.stall_ms,
      turnMs: b.turn_ms,
    },
    ...(input.resume ? { resume: input.resume } : {}),
    ...(input.generation === undefined ? {} : { generation: input.generation }),
    env: { FORGE_RUN_TOKEN: input.token, FORGE_TICKET: ticket.id },
    ...(input.pathPrepend === undefined || input.pathPrepend.length === 0
      ? {}
      : { pathPrepend: [...input.pathPrepend] }),
    permissions: input.permissions,
    isolation: 'host',
  };
}
