/**
 * Rig helpers for the fallback and substitute scenarios: the retry table, an agent's `runs_on`, a failing run and a
 * ticket whose agent has run out of places to run.
 *
 * Why: the ladder (retry, fallback list, substitute, owner) is pinned from several angles, and each scenario starts
 *   the same way: a project whose implementer has a given list of places to run, a ticket, and runs that fail with a
 *   given family. Building that once keeps each scenario a short story of what differs: the list, the family, the
 *   switch, the restart.
 *
 * Exports: RETRY, model, runsOn, writer, setProject, fail, failRun, run, rows, exhausted, withFrontend.
 * Depends on: helpers/rig, helpers/scripted-driver, @forge/core. No IO.
 */

import { BUILTIN_AGENTS } from '@forge/core';
import type { AgentDefinition } from '@forge/core';
import type { Rig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

export const RETRY = {
  rate_limit: { base_ms: 1000, max_ms: 8000, max_attempts: 1 },
  crash: { delay_ms: 1000, max_attempts: 1 },
  stall: { delay_ms: 1000, max_attempts: 1 },
  unknown: { delay_ms: 1000, max_attempts: 1 },
};

export const model = (id: string) => ({ kind: 'model', id });
export const runsOn = (fallbacks: unknown[], on_exhausted?: string) => ({
  harness: 'project_default',
  model: model('opus'),
  fallbacks,
  ...(on_exhausted === undefined ? {} : { on_exhausted }),
});

export const writer = (name: string, scope: string): AgentDefinition => ({
  ...(BUILTIN_AGENTS['implementer'] as AgentDefinition),
  name,
  write_scope: [scope],
  origin: 'custom',
});

/** Saves the project settings whole: the implementer's `runs_on` (and any extra doc) in one save. */
export async function setProject(
  rig: Rig,
  implementerRunsOn: unknown,
  extra: Record<string, unknown> = {},
) {
  const current = await rig.config.project('forge');
  await rig.config.append({
    scope: 'project',
    project: 'forge',
    doc: {
      ecosystems: ['node'],
      default_harness: 'scripted',
      checks: [{ name: 'test', role: 'test', command: 'pnpm test' }],
      tier_c_globs: ['**/auth/**'],
      ...extra,
      agents: {
        ...((extra['agents'] as object | undefined) ?? {}),
        overrides: { implementer: { runs_on: implementerRunsOn } },
      },
    } as never,
    author: 'test',
    reason: 'fallback scenario',
    expectedVersion: current.version.project,
  });
}

export const fail = (family: 'rate_limit' | 'model_unavailable' | 'crash') =>
  makeResult({ status: 'error', errorFamily: family });

export async function failRun(
  rig: Rig,
  runId: string,
  family: Parameters<typeof fail>[0],
) {
  rig.driver.finish(runId, fail(family));
  await rig.flush();
  await rig.tick();
}

export const run = (rig: Rig, id: string) =>
  rig.storage.transaction((tx) => tx.runs.get(id));
export const rows = (rig: Rig, id: string) =>
  rig.storage.transaction((tx) => tx.stageRuns.listByTicket(id));

/** An Express ticket whose implementer has no fallback list, rate-limited to the end of its retries. */
export async function exhausted(
  rig: Rig,
  runsOnFor = runsOn([]),
  extra: Record<string, unknown> = {},
): Promise<string> {
  await setProject(rig, runsOnFor, extra);
  const id = await rig.request('Fix it');
  await rig.tick();
  await failRun(rig, 'run-1', 'rate_limit');
  rig.clock.advance(2_000);
  await rig.tick();
  await failRun(rig, 'run-2', 'rate_limit');
  await rig.tick();

  return id;
}

export const withFrontend = {
  agents: { custom: { 'frontend-writer': writer('Frontend', 'apps/web/**') } },
};
