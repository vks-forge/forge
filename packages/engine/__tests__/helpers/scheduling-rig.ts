/**
 * Helpers for the scheduling scenarios: register a project on the scripted driver, ask as a
 * project, end runs, build a quota result.
 *
 * Why: the scripted driver reports its own id as every run's harness, so a scenario about
 *   quota pauses or per-harness limits must give its projects that same harness id; doing it
 *   in one place keeps each scenario about the scheduling rule, not the wiring.
 *
 * Exports: HOUR, addProject(), ask(), finishAll(), quotaResult().
 * Depends on: @forge/core, helpers/fakes, helpers/rig, helpers/scripted-driver. No IO.
 */

import { ProjectConfig } from '@forge/core';
import { createFakeWorktrees } from '#tests/helpers/fakes.js';
import { intake } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

export const HOUR = 3_600_000;

/** Registers a project that runs on the scripted driver's own id, so quota pauses and harness caps line up. */
export async function addProject(
  rig: Rig,
  slug: string,
  prefix: string,
  settings: Record<string, unknown> = {},
): Promise<void> {
  if (slug !== 'forge') {
    await rig.seedProject({ id: slug, slug, prefix });
    rig.runtimes.set(slug, {
      ...rig.runtime.current!,
      config: ProjectConfig.parse({
        slug,
        prefix,
        profile: 'generic',
        default_harness: 'scripted',
      }),
      worktrees: createFakeWorktrees(),
    });
  }

  await rig.config.append({
    scope: 'project',
    project: slug,
    doc: { default_harness: 'scripted', ...settings },
    author: 'test',
    reason: 'harness',
    expectedVersion: 0,
  });
}

export const ask = (rig: Rig, project: string, text: string) =>
  rig.engine.ingest(
    intake({ project, payload: { text, card_type: 'pr_issue' } }, rig.clock.now()),
  );

export async function finishAll(rig: Rig, runIds: string[]): Promise<void> {
  for (const id of runIds) {
    rig.driver.finish(id, makeResult());
  }

  await rig.flush();
}

export const quotaResult = (reset?: string) =>
  makeResult({
    status: 'error',
    errorFamily: 'quota',
    ...(reset ? { retryNotBefore: reset } : {}),
  });
