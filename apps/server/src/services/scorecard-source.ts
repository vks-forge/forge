/**
 * The scorecards of one project, computed on read.
 *
 * Why: how each agent and each pipeline shape has been doing (d-0081) is derived from rows Forge already keeps,
 *   never stored and never applied, so the owner's Agents and Pipelines screens read the same numbers the Director
 *   reads when it plans a ticket or picks a substitute. The rows are gathered by the engine's batched loader (the
 *   tickets touched inside the window, capped), the roster is the project's effective one (so an agent the owner
 *   archived still shows for the history it has), and core `computeScorecards` does the arithmetic. With an
 *   `agent` the reply carries that agent's card only (no shapes), 404 `agent_not_found` for an id the roster does
 *   not have; an unknown project is 404 `project_not_found`.
 *
 * Exports: projectScorecards().
 * Depends on: @forge/core (computeScorecards), @forge/engine (loadScorecardInput), services/{agent-state,find-project},
 *   services/http/http-errors, types/agent-store. IO: reads storage and settings.
 */

import { computeScorecards } from '@forge/core';
import type { ScorecardRange, ScorecardReply } from '@forge/core';
import { loadScorecardInput } from '@forge/engine';
import { createAgentState } from '#/services/agent-state.js';
import { findProject } from '#/services/find-project.js';
import { HttpError } from '#/services/http/http-errors.js';
import type { AgentDeps } from '#/types/agent-store.types.js';

/** The reply for project `slug` over `range`, narrowed to one agent when `agent` is given. */
export async function projectScorecards(
  deps: AgentDeps,
  slug: string,
  range: ScorecardRange,
  agent?: string,
): Promise<ScorecardReply> {
  const project = await deps.storage.transaction((tx) => findProject(tx, slug));
  const roster = (await createAgentState(deps).read({ scope: 'project', slug })).views;
  if (agent !== undefined && !roster.some((v) => v.id === agent)) {
    throw new HttpError(404, 'agent_not_found', `no agent ${agent} in ${slug}`);
  }

  const reply = computeScorecards(
    await deps.storage.transaction((tx) =>
      loadScorecardInput(tx, { project: project.id, roster, now: deps.now(), range }),
    ),
  );

  return agent === undefined
    ? reply
    : { ...reply, agents: reply.agents.filter((a) => a.agent_id === agent), shapes: [] };
}
