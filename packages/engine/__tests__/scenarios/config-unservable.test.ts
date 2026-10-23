/**
 * Scenario: one project with unreadable settings does not stop the other projects.
 *
 * Why: every project's stored settings are validated when the tick reads them. If a single
 *   override stopped validating (a schema change, a hand-edited row), the old rule failed the
 *   whole tick, so every healthy project stopped getting reconciled, settled and dispatched
 *   because of one bad document. The broken project must be skipped and named, the rest must
 *   carry on, and an archived project must never be read at all.
 *
 * Pins: a failing project is reported in the tick errors with slug and reason and through
 *   `unservableProjects()`; its tickets are not triaged or dispatched; another project still
 *   dispatches in the same tick; an archived project's config is never read.
 * Depends on: helpers/rig, @forge/core, vitest.
 */

import { ProjectConfig } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { createFakeWorktrees } from '#tests/helpers/fakes.js';
import { intake, makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';

async function addApi(rig: Rig): Promise<void> {
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
}

const request = (rig: Rig, project: string, text: string) =>
  rig.engine.ingest(
    intake({ project, payload: { text, card_type: 'pr_issue' } }, rig.clock.now()),
  );

/** An engine whose source throws for `slug` only. */
function breakProject(rig: Rig, slug: string, reads: string[] = []) {
  return rig.restart('srv-b', {
    config: {
      ...rig.config,
      project: (s: string) => {
        reads.push(s);

        return s === slug
          ? Promise.reject(new Error('stored override is not valid'))
          : rig.config.project(s);
      },
    },
  });
}

describe('a project whose settings do not validate', () => {
  it('is reported with slug and reason while the other project still dispatches', async () => {
    const rig = await makeRig();
    await addApi(rig);
    await request(rig, 'forge', 'forge work');
    await request(rig, 'api', 'api work');
    const engine = breakProject(rig, 'forge');

    const report = await rig.tickOn(engine);

    expect(report.dispatched.map((d) => d.ticketId)).toEqual(['AP-1']);
    // Triage, the brief and the launch take several ticks; each one reports the broken project.
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors).toSatisfy((all: typeof report.errors) =>
      all.every(
        (e) =>
          e.where === 'project config forge' &&
          e.message === 'stored override is not valid',
      ),
    );

    expect(engine.unservableProjects().get('forge')).toBe('stored override is not valid');
    expect((await rig.ticket('FG-1')).status).toBe('inbox');
  });

  it('does not resume its interrupted runs', async () => {
    const rig = await makeRig();
    await request(rig, 'forge', 'forge work');
    await rig.tick();
    rig.driver.emit('run-1', { type: 'session', session_ref: 'sess-A' });
    await rig.flush();
    await rig.engine.interruptRun('run-1');
    await rig.flush();

    const report = await rig.tickOn(breakProject(rig, 'forge'));

    expect(report.resumed).toEqual([]);
    expect((await rig.storage.transaction((tx) => tx.runs.get('run-1')))?.status).toBe(
      'interrupted',
    );
  });

  it('is cleared from the list once its settings validate again', async () => {
    const rig = await makeRig();
    const engine = breakProject(rig, 'forge');
    await rig.tickOn(engine);
    expect(engine.unservableProjects().size).toBe(1);

    const healthy = rig.restart('srv-c');
    await rig.tickOn(healthy);

    expect(healthy.unservableProjects().size).toBe(0);
  });
});

describe('an archived project', () => {
  it('is never read from the config source', async () => {
    const rig = await makeRig();
    await rig.seedProject({ id: 'old', slug: 'old', prefix: 'OL', status: 'archived' });
    const reads: string[] = [];
    const engine = breakProject(rig, 'old', reads);

    const report = await rig.tickOn(engine);

    expect(reads).toEqual(['forge']);
    expect(report.errors).toEqual([]);
  });
});
