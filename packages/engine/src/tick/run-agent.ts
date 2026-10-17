/**
 * Resolves the agent a ticket's next run uses, against this tick's settings.
 *
 * Why: who does a ticket's work is now an agent (d-0147): its instructions are added to the
 *   Worker's brief, its runs_on picks the harness and model, its budget replaces the company
 *   run budget key by key, its fallback list replaces the company one, its tools and write
 *   scope narrow what policy admits. The engine must read all of that from one place at one
 *   moment, the tick's settings snapshot, so the run request, the run row and the scheduler's
 *   harness choice agree and a save mid-tick applies to the next tick as a whole. Until lane
 *   pipelines exist every lane runs the implementer; its built-in definition reproduces the
 *   pre-agent run request exactly (project harness, lane matrix model, no instructions).
 *
 * Exports: agentViews(), resolveAgent(), modelFor().
 * Depends on: @forge/core (effectiveAgents, laneAgent, Lane), tick/tick-config, types/run-agent,
 *   types/tick. No IO.
 */

import { effectiveAgents, laneAgent } from '@forge/core';
import type { AgentView, HarnessRef, Lane, ModelChoice } from '@forge/core';
import { projectSettings } from '#/tick/tick-config.js';
import type { ResolvedAgent } from '#/types/run-agent.types.js';
import type { TickConfig } from '#/types/tick.types.js';

/** The engine starts a run on any harness it has a driver for; whether it is signed in is the driver's start to judge. */
const ALWAYS_READY = (): { ready: boolean; reasons: string[] } => ({
  ready: true,
  reasons: [],
});

/** Every agent `slug` sees in this snapshot, project overrides applied. */
export function agentViews(config: TickConfig, slug: string): AgentView[] {
  return effectiveAgents(
    config.forge.agents,
    projectSettings(config, slug).agents ?? { custom: {}, overrides: {}, disabled: [] },
    ALWAYS_READY,
  );
}

const harnessOf = (ref: HarnessRef, projectDefault: string): string =>
  ref === 'project_default' ? projectDefault : ref;

/**
 * The agent for a ticket of `slug` in `lane`. `agentId` names the agent an earlier run of the
 * ticket used (a resume continues on it); it is honoured while that agent is still usable, else
 * the lane's agent answers.
 */
export function resolveAgent(
  config: TickConfig,
  slug: string,
  lane: Lane,
  agentId?: string,
): ResolvedAgent {
  const views = agentViews(config, slug);
  const named =
    agentId === undefined
      ? undefined
      : views.find(
          (v) =>
            v.id === agentId &&
            !v.tags.includes('disabled') &&
            !v.tags.includes('archived'),
        );

  const view = named ?? laneAgent(views, lane);
  const projectDefault = projectSettings(config, slug).default_harness;
  const { runs_on } = view.definition;

  return {
    id: view.id,
    hash: view.hash,
    definition: view.definition,
    harnessId: harnessOf(runs_on.harness, projectDefault),
    modelChoice: runs_on.model,
    fallbackHarnesses: runs_on.fallbacks.map((f) => harnessOf(f.harness, projectDefault)),
  };
}

function modelOfChoice(
  config: TickConfig,
  lane: Lane,
  choice: ModelChoice,
): string | undefined {
  switch (choice.kind) {
    case 'forge_default':
      return config.forge.models.worker[lane];
    case 'harness_default':
      return undefined;
    case 'model':
      return choice.id;
  }
}

/**
 * The model to send for `agent` on `harnessId`: the agent's own choice, or the choice of the
 * fallback entry for that harness when the scheduler moved the run there. `undefined` means
 * send none and let the harness pick.
 */
export function modelFor(
  config: TickConfig,
  agent: ResolvedAgent,
  lane: Lane,
  harnessId: string,
): string | undefined {
  if (harnessId !== agent.harnessId) {
    const slot = agent.definition.runs_on.fallbacks.find(
      (_, i) => agent.fallbackHarnesses[i] === harnessId,
    );

    if (slot) {
      return modelOfChoice(config, lane, slot.model);
    }
  }

  return modelOfChoice(config, lane, agent.modelChoice);
}
