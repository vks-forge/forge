/**
 * Deleting a project through `DELETE /projects/:slug`.
 *
 * Why: delete is the clean-slate path that archive is not, and it is the one project action
 *   that destroys data. It must remove the project's rows and Forge-owned folders so the same
 *   folder can be added again, must never touch the user's own folder, must refuse a call that
 *   did not repeat the slug, and must refuse while a Worker is still running in the project.
 *
 * Pins: 200 `{ deleted }` with the row, tickets and runs gone, the registry empty and the
 *   memory and worktree folders removed while the user's folder and its files stay; the same
 *   slug and folder register again with 201 and continue the settings versions; 400
 *   `confirm_mismatch` and `invalid_request` change nothing; 404 `project_not_found`; 409
 *   `project_busy` for a running run changes nothing and a finished run does not block.
 * Depends on: helpers/projects-rig, helpers/fixture-repo. IO: a real git clone, folders in the
 *   OS temp dir, a loopback socket.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Run, Ticket } from '@forge/core';
import { createFixtureRepo, fixtureProjectBody } from '#tests/helpers/fixture-repo.js';
import type { FixtureRepo } from '#tests/helpers/fixture-repo.js';
import { startProjectsRig } from '#tests/helpers/projects-rig.js';
import type { ProjectsRig } from '#tests/helpers/projects-rig.js';

const AT = '2026-10-16T00:00:00.000Z';

let fixture: FixtureRepo;
let rigs: ProjectsRig;

const memoryDir = () => join(fixture.dataHome, 'memory', 'fixture');
const worktreeDir = () => join(fixture.dataHome, 'worktrees', 'fixture');

beforeAll(() => {
  fixture = createFixtureRepo();
}, 120_000);

afterAll(() => {
  fixture.dispose();
});

beforeEach(async () => {
  rigs = await startProjectsRig(`${fixture.dataHome}/worktrees`);
  await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));
  for (const dir of [memoryDir(), worktreeDir()]) {
    mkdirSync(join(dir, 'nested'), { recursive: true });
    writeFileSync(join(dir, 'nested', 'file.txt'), 'forge-owned');
  }
});

afterEach(async () => {
  await rigs.rig.close();
});

const ticket = (over: Partial<Ticket> = {}): Ticket => ({
  id: 'FX-1' as Ticket['id'],
  project: 'fixture',
  title: 't',
  body: 'b',
  type: 'feat',
  lane: 'express',
  tier_predicted: 'A',
  status: 'in_progress',
  status_version: 0,
  rework_count: 0,
  priority: 0,
  created_at: AT,
  updated_at: AT,
  blocked_by: [],
  ...over,
});

const run = (status: Run['status']): Run => ({
  id: 'run-1',
  ticket_id: 'FX-1',
  project: 'fixture',
  harness: 'fake',
  driver_version: '0.0.0',
  cwd: '/tmp/work',
  lane: 'express',
  started_at: AT,
  status,
  owner: 'srv-test',
  generation: 1,
});

const seedRun = (status: Run['status']) =>
  rigs.storage.transaction(async (tx) => {
    await tx.tickets.insert(ticket());
    await tx.runs.insert(run(status));
  });

describe('DELETE /projects/:slug', () => {
  it('removes the project, its rows and Forge folders, and leaves the user folder alone', async () => {
    await seedRun('success');

    const res = await rigs.rig.json('DELETE', '/projects/fixture', {
      confirm: 'fixture',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 'fixture' });
    expect(await rigs.storage.transaction((tx) => tx.projects.list())).toEqual([]);
    expect(
      await rigs.storage.transaction((tx) => tx.tickets.get('FX-1' as never)),
    ).toBeNull();

    expect(await rigs.storage.transaction((tx) => tx.runs.get('run-1'))).toBeNull();
    expect(rigs.registry.slugs()).toEqual([]);
    expect(existsSync(memoryDir())).toBe(false);
    expect(existsSync(worktreeDir())).toBe(false);
    expect(existsSync(join(fixture.root, 'package.json'))).toBe(true);
    expect(existsSync(join(fixture.root, '.git'))).toBe(true);
    expect((await rigs.rig.json('GET', '/projects')).body).toEqual({ projects: [] });
  });

  it('lets the same slug and folder be added again, continuing the settings versions', async () => {
    await rigs.rig.json('DELETE', '/projects/fixture', { confirm: 'fixture' });

    const again = await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));

    expect(again.status).toBe(201);
    expect(again.body).toMatchObject({ settings_version: 2 });
    expect(rigs.registry.slugs()).toEqual(['fixture']);
  });

  it('refuses a confirmation that is not the slug and deletes nothing', async () => {
    const wrong = await rigs.rig.json('DELETE', '/projects/fixture', {
      confirm: 'other',
    });

    const missing = await rigs.rig.json('DELETE', '/projects/fixture', {});

    expect(wrong.status).toBe(400);
    expect(wrong.body).toMatchObject({ error: { code: 'confirm_mismatch' } });
    expect(missing.status).toBe(400);
    expect(await rigs.storage.transaction((tx) => tx.projects.list())).toHaveLength(1);
    expect(rigs.registry.slugs()).toEqual(['fixture']);
    expect(existsSync(memoryDir())).toBe(true);
  });

  it('404s an unknown project', async () => {
    const res = await rigs.rig.json('DELETE', '/projects/nope', { confirm: 'nope' });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'project_not_found' } });
  });

  it('refuses with 409 while a run is working and deletes nothing', async () => {
    await seedRun('running');

    const res = await rigs.rig.json('DELETE', '/projects/fixture', {
      confirm: 'fixture',
    });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'project_busy' } });
    expect(await rigs.storage.transaction((tx) => tx.projects.list())).toHaveLength(1);
    expect(await rigs.storage.transaction((tx) => tx.runs.get('run-1'))).not.toBeNull();
    expect(rigs.registry.slugs()).toEqual(['fixture']);
    expect(existsSync(worktreeDir())).toBe(true);
  });
});
