/**
 * Scenario: the engine runs on the settings stored in the database, re-read every tick.
 *
 * Why: an owner who changes a limit in the settings page expects the next tick to obey it
 *   without restarting the server (d-0085), and expects every run to say which settings it
 *   ran under so a surprising run can be explained later. If the engine kept the config it
 *   was started with, or read the source in the middle of a phase, a edit could be half
 *   applied inside one tick or never applied at all.
 *
 * Pins: a company edit changes the very next tick's dispatch capacity and models; the
 *   source is asked once per scope per tick, not per ticket; a project edit reaches the
 *   Worker contract; the run row stores `c<company>:p<project>`; a stored override that no
 *   longer validates fails the tick loudly and starts nothing.
 * Depends on: helpers/rig, vitest.
 */

import { ProjectConfig } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { createFakeGitHost } from '#tests/helpers/fake-git-host.js';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

async function saveCompany(rig: Rig, doc: Record<string, unknown>): Promise<void> {
  const { version } = await rig.config.company();
  await rig.config.append({
    scope: 'company',
    doc,
    author: 'test',
    reason: 'edit',
    expectedVersion: version,
  });
}

describe('config is read through the ConfigSource each tick', () => {
  it('applies a company edit on the next tick without recreating the engine', async () => {
    const rig = await makeRig({
      engine: { max_concurrent_global: 1, max_concurrent_per_project: 2 },
    });

    await rig.request('first');
    await rig.request('second');

    const before = await rig.tick();
    expect(before.dispatched).toHaveLength(1);

    await saveCompany(rig, {
      engine: { max_concurrent_global: 2, max_concurrent_per_project: 2 },
    });

    const after = await rig.tick();

    expect(after.dispatched).toEqual([
      expect.objectContaining({ ticketId: 'FG-2', kind: 'new' }),
    ]);
  });

  it('gives the Worker the model the settings name at dispatch time', async () => {
    const rig = await makeRig();
    await rig.request('first');
    await rig.tick();
    expect(rig.driver.starts[0]).toMatchObject({ model: 'sonnet' });

    // One run per project at a time: let the first end so the second may start.
    rig.driver.finish('run-1', makeResult());
    await rig.flush();
    await saveCompany(rig, { models: { worker: { express: 'opus' } } });
    await rig.request('second');
    await rig.tick();

    expect(rig.driver.starts[1]).toMatchObject({ model: 'opus' });
  });

  it('asks the source once for the company and once per project in a tick', async () => {
    const rig = await makeRig();
    await rig.request('first');
    await rig.request('second');
    const base = { ...rig.configReads };

    await rig.engine.tick();

    expect(rig.configReads.company - base.company).toBe(1);
    expect(rig.configReads.project - base.project).toBe(1);
  });

  it('puts a project edit into the next Worker contract', async () => {
    const rig = await makeRig();
    rig.runtime.current = {
      ...rig.runtime.current!,
      config: ProjectConfig.parse({
        slug: 'forge',
        prefix: 'FG',
        profile: 'generic',
        default_harness: 'scripted',
      }),
      gitHost: createFakeGitHost(),
      gates: [],
    };

    await rig.config.append({
      scope: 'project',
      project: 'forge',
      doc: { checks: [{ name: 'test', role: 'test', command: 'make check' }] },
      author: 'test',
      reason: 'edit',
      expectedVersion: 0,
    });

    await rig.request('first');
    await rig.tick();

    expect(rig.driver.starts[0]!.prompt).toContain('make check');
  });

  it('records the settings versions on the run row', async () => {
    const rig = await makeRig();
    await rig.request('first');
    await rig.tick();
    await saveCompany(rig, { engine: { stall_ms: 400_000 } });
    await saveCompany(rig, { engine: { stall_ms: 500_000 } });
    await rig.config.append({
      scope: 'project',
      project: 'forge',
      doc: { ecosystems: ['node'] },
      author: 'test',
      reason: 'edit',
      expectedVersion: 0,
    });

    await rig.request('second');
    rig.driver.finish('run-1', makeResult());
    await rig.flush();
    await rig.tick();

    const runs = await rig.storage.transaction(async (tx) => [
      await tx.runs.get('run-1'),
      await tx.runs.get('run-2'),
    ]);

    expect(runs[0]?.config_version).toBe('c0:p0');
    expect(runs[1]?.config_version).toBe('c2:p1');
  });

  it('records an exact version when a company save lands between the two reads', async () => {
    const rig = await makeRig();
    let saved = false;
    const racing = {
      ...rig.config,
      project: async (slug: string) => {
        if (!saved) {
          saved = true;
          await saveCompany(rig, { engine: { stall_ms: 400_000 } });
        }

        return rig.config.project(slug);
      },
    };

    const engine = rig.restart('srv-b', { config: racing });
    await rig.request('first');
    await rig.tickOn(engine);

    const run = await rig.storage.transaction((tx) => tx.runs.get('run-1'));

    expect(run?.config_version).toBe('c1:p0');
  });

  it('fails the tick and starts nothing when the stored settings no longer validate', async () => {
    const rig = await makeRig();
    const broken = {
      ...rig.config,
      company: () => Promise.reject(new Error('stored override is not valid')),
    };

    const engine = rig.restart('srv-b', { config: broken });
    await rig.request('first');

    const report = await rig.tickOn(engine);

    expect(report.dispatched).toEqual([]);
    expect(report.errors).toEqual([expect.objectContaining({ where: 'load config' })]);

    expect(rig.driver.starts).toHaveLength(0);
  });
});
