/**
 * Scenario: one run that cannot be resumed does not stop the others from resuming.
 *
 * Why: after a restart the app rebuilds each project's runtime while the engine resumes its
 *   interrupted runs (d-0092). That rebuild can throw for one project (a broken git host
 *   config, a repository folder that moved). If the throw escaped the resume phase, every
 *   other project's runs would stay interrupted, and the same throw would repeat on every
 *   tick: one broken project would freeze all of the work that was meant to survive a restart.
 *
 * Pins: a throwing runtime lookup for one project is recorded as a tick error and the run stays
 *   `interrupted` (tried again next tick) while the other project's run resumes. (Unservable
 *   projects are skipped before this point; config-unservable.test.ts pins that.)
 * Depends on: helpers/rig, helpers/resume, helpers/fakes, @forge/core, vitest.
 */

import { ProjectConfig } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { createFakeWorktrees } from '#tests/helpers/fakes.js';
import { getRun } from '#tests/helpers/resume.js';
import { intake, makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';

/** Two projects, each with one live, interrupted run that holds a session. */
async function twoInterruptedRuns(rig: Rig): Promise<void> {
  await rig.seedProject({ id: 'api', slug: 'api', prefix: 'AP' });
  rig.runtimes.set('api', {
    ...rig.runtime.current!,
    config: ProjectConfig.parse({
      slug: 'api',
      prefix: 'AP',
      profile: 'generic',
      default_harness: 'claude-code',
    }),
    worktrees: createFakeWorktrees(),
    baseRef: 'main',
  });

  for (const project of ['forge', 'api']) {
    await rig.engine.ingest(
      intake(
        { project, payload: { text: project, card_type: 'pr_issue' } },
        rig.clock.now(),
      ),
    );
  }

  await rig.tick();
  for (const id of ['run-1', 'run-2']) {
    rig.driver.emit(id, { type: 'session', session_ref: `sess-${id}` });
  }

  await rig.flush();
  for (const id of ['run-1', 'run-2']) {
    await rig.engine.interruptRun(id);
  }

  await rig.flush();
}

describe('resume phase isolation', () => {
  it('records a runtime that throws and still resumes the other projects', async () => {
    const rig = await makeRig();
    await twoInterruptedRuns(rig);
    const runs = await Promise.all([getRun(rig, 'run-1'), getRun(rig, 'run-2')]);
    const broken = runs.find((r) => r?.project === 'forge')!;
    const healthy = runs.find((r) => r?.project === 'api')!;

    const b = rig.restart('srv-b', {
      project: (slug, settings) => {
        if (slug === 'forge') {
          throw new Error('git host config is broken');
        }

        return rig.deps.project(slug, settings);
      },
    });

    const report = await b.tick();

    expect(report.resumed).toEqual([healthy.id]);
    expect(report.errors).toEqual([
      expect.objectContaining({
        where: `resume ${broken.id}`,
        message: expect.stringContaining('git host config is broken'),
      }),
    ]);

    expect((await getRun(rig, broken.id))?.status).toBe('interrupted');
    expect((await getRun(rig, healthy.id))?.status).toBe('running');
  });
});
