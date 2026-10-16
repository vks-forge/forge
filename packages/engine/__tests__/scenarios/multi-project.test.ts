/**
 * Scenario: one engine, several projects.
 *
 * Why: a Forge install manages many repositories (d-0082). If the engine used one set of
 *   worktrees, one base branch or one harness for everything, a ticket of project B would
 *   be cut from project A's clone, merged into A's base, or run on the wrong harness, and
 *   two projects' tickets would collide on ids. Each ticket must resolve its own project's
 *   runtime and settings at every step, and a project the server cannot serve (unknown
 *   harness, archived) must stop at a clear, recorded state instead of running elsewhere.
 *
 * Pins: ids count per project prefix; each ticket's worktree, base branch and run row come
 *   from its own project (runs record `project`); the settings view of the tick reaches
 *   `deps.project`; a harness with no driver parks the ticket with the reason and starts
 *   nothing (fail closed); an archived project accepts no intake and dispatches nothing.
 * Depends on: helpers/rig, helpers/fakes, @forge/core, vitest.
 */

import { ProjectConfig } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { createFakeWorktrees } from '#tests/helpers/fakes.js';
import { intake, makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

const API = { id: 'api', slug: 'api', prefix: 'AP' };

/** Seeds the `api` project with its own worktrees and base branch. */
async function addApi(rig: Rig, baseRef = 'develop') {
  await rig.seedProject(API);
  const worktrees = createFakeWorktrees();
  rig.runtimes.set('api', {
    ...rig.runtime.current!,
    config: ProjectConfig.parse({
      slug: 'api',
      prefix: 'AP',
      profile: 'generic',
      default_harness: 'claude-code',
    }),
    worktrees,
    baseRef,
  });

  return worktrees;
}

const request = (rig: Rig, project: string, text: string) =>
  rig.engine.ingest(
    intake({ project, payload: { text, card_type: 'pr_issue' } }, rig.clock.now()),
  );

describe('several projects in one engine', () => {
  it('numbers tickets per project prefix', async () => {
    const rig = await makeRig();
    await addApi(rig);

    const ids: string[] = [];
    for (const project of ['forge', 'api', 'forge', 'api', 'api']) {
      const r = await request(rig, project, `work in ${project}`);
      ids.push(r.status === 'ticket_created' ? r.ticketId : r.status);
    }

    expect(ids).toEqual(['FG-1', 'AP-1', 'FG-2', 'AP-2', 'AP-3']);
  });

  it("cuts each ticket's worktree from its own project and records the project on the run", async () => {
    const rig = await makeRig();
    const apiTrees = await addApi(rig, 'develop');
    await request(rig, 'forge', 'forge work');
    await request(rig, 'api', 'api work');

    const report = await rig.tick();

    expect(report.dispatched.map((d) => d.ticketId).sort()).toEqual(['AP-1', 'FG-1']);
    expect(rig.worktrees.created.map((c) => [c.ticketId, c.baseRef])).toEqual([
      ['FG-1', 'main'],
    ]);

    expect(apiTrees.created.map((c) => [c.ticketId, c.baseRef])).toEqual([
      ['AP-1', 'develop'],
    ]);

    const runs = await rig.storage.transaction(async (tx) => [
      await tx.runs.listByTicket('FG-1'),
      await tx.runs.listByTicket('AP-1'),
    ]);

    expect(runs[0]?.[0]?.project).toBe('forge');
    expect(runs[1]?.[0]?.project).toBe('api');
  });

  it('hands deps.project the settings the tick read, so a changed version can rebuild the runtime', async () => {
    const rig = await makeRig();
    const seen: (number | undefined)[] = [];
    const inner = rig.deps.project;
    const spy = {
      ...rig.deps,
      project: (slug: string, view: Parameters<typeof inner>[1]) => {
        seen.push(view?.version.project);

        return inner(slug, view);
      },
    };

    await request(rig, 'forge', 'x');
    const engine = rig.restart('srv-a', spy);
    await rig.tickOn(engine);
    await rig.config.append({
      scope: 'project',
      project: 'forge',
      doc: { checks: [{ name: 'test', role: 'test', command: 'make check' }] },
      author: 'test',
      reason: 'edit',
      expectedVersion: 0,
    });

    await request(rig, 'forge', 'y');
    rig.driver.finish('run-1', makeResult());
    await rig.flush();
    rig.clock.advance(31_000);
    await rig.tickOn(engine);

    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(1);
  });

  it('parks a ticket whose project names a harness the server does not have, and starts nothing', async () => {
    const rig = await makeRig();
    await rig.config.append({
      scope: 'project',
      project: 'forge',
      doc: { default_harness: 'codex' },
      author: 'test',
      reason: 'use codex',
      expectedVersion: 0,
    });

    const id = await rig.request('Fix the doctor check');
    const report = await rig.tick();

    expect(report.dispatched).toEqual([]);
    expect(report.parked).toEqual([
      { ticketId: id, reason: expect.stringContaining('harness "codex"') },
    ]);

    expect(await rig.ticket(id)).toMatchObject({
      status: 'waiting_human',
      blocked_reason: expect.stringContaining('not installed on this server'),
    });

    expect(rig.worktrees.created).toEqual([]);
    expect(rig.driver.starts).toEqual([]);
    expect(await rig.storage.transaction((tx) => tx.runs.listByTicket(id))).toEqual([]);
  });

  it('picks the harness per project: another project keeps running while one is parked', async () => {
    const rig = await makeRig();
    await addApi(rig);
    await rig.config.append({
      scope: 'project',
      project: 'forge',
      doc: { default_harness: 'codex' },
      author: 'test',
      reason: 'use codex',
      expectedVersion: 0,
    });

    await request(rig, 'forge', 'forge work');
    await request(rig, 'api', 'api work');
    const report = await rig.tick();

    expect(report.dispatched.map((d) => d.ticketId)).toEqual(['AP-1']);
    expect(report.parked.map((p) => p.ticketId)).toEqual(['FG-1']);
  });

  it('accepts no intake for an archived project', async () => {
    const rig = await makeRig();
    await addApi(rig);
    const first = await request(rig, 'api', 'before archiving');
    expect(first.status).toBe('ticket_created');
    await rig.tick();

    await rig.seedProject({ ...API, status: 'archived' });
    const after = await request(rig, 'api', 'after archiving');

    expect(after).toMatchObject({
      status: 'ignored',
      reason: expect.stringContaining('archived'),
    });
  });

  it('does not spend a run slot on a ticket of a project that is not ready', async () => {
    const rig = await makeRig({ engine: { max_concurrent_global: 1 } });
    await addApi(rig);
    await request(rig, 'api', 'api work');
    await rig.seedProject({ ...API, status: 'onboarding' });
    await request(rig, 'forge', 'forge work');

    const report = await rig.tick();

    expect(report.dispatched.map((d) => d.ticketId)).toEqual(['FG-1']);
  });
});
