/**
 * The grant layer a run's agent adds to its tool policy.
 *
 * Why: an agent's tool list and write scope are enforced by `admit()`, which reads the run's
 *   grant on every tool call. The run row names its agent, so the layer is rebuilt from the
 *   current settings on each call: an owner who narrows an agent mid-run tightens the next
 *   call. An agent the settings no longer list cannot happen (agents are archived, never
 *   deleted), but if it ever did the run gets the narrowest layer, not none, so the failure
 *   cannot widen what a Worker may do (code.md rule 6: fail closed).
 *
 * Exports: agentGrantForRun().
 * Depends on: @forge/core (effectiveAgents, EffectiveConfig), @forge/tools (agentGrant, Grant). No IO.
 */

import { effectiveAgents } from '@forge/core';
import type { EffectiveConfig } from '@forge/core';
import { agentGrant } from '@forge/tools';
import type { Grant } from '@forge/tools';

const NO_PROJECT_AGENTS = { custom: {}, overrides: {}, disabled: [] };

/** The agent layer for the run's agent, or undefined for a run that records none (older runs) or whose agent adds no limit. */
export function agentGrantForRun(
  config: EffectiveConfig,
  agentId: string | undefined,
): Grant | undefined {
  if (agentId === undefined) {
    return undefined;
  }

  const views = effectiveAgents(
    config.forge.agents,
    config.project.agents ?? NO_PROJECT_AGENTS,
    () => ({ ready: true, reasons: [] }),
  );

  const found = views.find((v) => v.id === agentId)?.definition;

  return agentGrant(found ?? { tools: [], write_scope: [] });
}
