/**
 * Lane pipeline: the list a lane runs as of this tick, with the roster it is judged against.
 *
 * Why: three places ask the same question about a lane's pipeline: the planning step (which ops of a plan can
 *   hold), the ticket's first snapshot (what the ops apply to) and the proposal rule (what a proposed list
 *   would be). They must agree on the effective list (project over company over shipped), the roster of usable
 *   agents and the context the Director's ops are judged in, so it is read in one place from the tick's
 *   settings snapshot. The one-family rule for a critic is a save-time rule (a ticket never parks because a
 *   second harness was connected after its pipeline was saved), so the context carries no families unless
 *   the caller has them (the substitute choice does).
 *
 * Exports: lanePipeline(), adjustContext().
 * Depends on: @forge/core (effectivePipelines, AdjustContext), tick/run-agent, tick/tick-config. No IO.
 */

import { effectivePipelines } from '@forge/core';
import type { AdjustContext, AgentRole, Lane, PipelineDefinition } from '@forge/core';
import { agentViews } from '#/tick/run-agent.js';
import { projectSettings } from '#/tick/tick-config.js';
import type { TickConfig } from '#/types/tick.types.js';

/** The effective definition of `lane` for project `slug`, the roster and the role of every agent in it. */
export function lanePipeline(config: TickConfig, slug: string, lane: Lane) {
  const roster = agentViews(config, slug);
  const roles: Record<string, AgentRole> = Object.fromEntries(
    roster.map((v) => [v.id, v.definition.role]),
  );

  const definition: PipelineDefinition = effectivePipelines(
    config.forge.pipelines,
    projectSettings(config, slug).pipelines,
    roster,
  )[lane].definition;

  return { roster, roles, definition };
}

/** The context the Director's ops are judged in: the roster, the stages routing added and the stages already started. */
export function adjustContext(
  roster: AdjustContext['roster'],
  lane: Lane,
  routed: readonly string[],
  frozen: readonly string[] = [],
  families: readonly string[] = [],
): AdjustContext {
  return { roster, lane, families_available: families, routed, frozen };
}
