/**
 * Projects API: recovery from a failed registration, folders inside Forge storage, config errors.
 *
 * Why: registering a project writes a row, a first settings version (which can never be
 *   deleted) and a served runtime. A failure part way must leave nothing a retry cannot
 *   finish. A folder inside Forge's own data home (memory repositories, Worker worktrees)
 *   must never become a project, whether named directly or through a link, because that
 *   would let Worker-writable files stand in for the repository. And a project the engine
 *   skips for unreadable settings has to show why in the list, or the owner sees a project
 *   that silently runs nothing.
 *
 * Pins: a registration that fails in the registry removes its row and the same request then
 *   succeeds (settings version continues); an existing slug is still refused; folders in the
 *   data home, in a worktree and behind a junction are 400 `path_in_data_home` and save
 *   nothing; `config_error` appears on the skipped project only.
 * Depends on: helpers/fixture-repo, helpers/projects-rig, helpers/temp, src/routes.
 *   IO: real git repositories in the OS temp dir, in-memory storage.
 */

import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createFixtureRepo, fixtureProjectBody } from '#tests/helpers/fixture-repo.js';
import type { FixtureRepo } from '#tests/helpers/fixture-repo.js';
import { startProjectsRig } from '#tests/helpers/projects-rig.js';
import type { ProjectsRig } from '#tests/helpers/projects-rig.js';
import { trackTemp } from '#tests/helpers/temp.js';

let fixture: FixtureRepo;
let second: FixtureRepo;
let rigs: ProjectsRig;

beforeAll(() => {
  fixture = createFixtureRepo();
  second = createFixtureRepo();
}, 120_000);

afterAll(() => {
  fixture.dispose();
  second.dispose();
});

beforeEach(async () => {
  rigs = await startProjectsRig(`${fixture.dataHome}/worktrees`);
});

afterEach(async () => {
  await rigs.rig.close();
});

const nothingSaved = async (slug = 'fixture') => {
  expect(await rigs.storage.transaction((tx) => tx.projects.list())).toEqual([]);
  expect(await rigs.config.history('project', slug)).toEqual([]);
  expect(rigs.registry.slugs()).toEqual([]);
};

describe('POST /projects when registration fails half way', () => {
  it('frees the slug, prefix and folder so the same request succeeds on retry', async () => {
    const register = vi
      .spyOn(rigs.registry, 'register')
      .mockRejectedValueOnce(new Error('runtime could not be built'));

    const failed = await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));

    expect(failed.status).toBe(500);
    expect(await rigs.storage.transaction((tx) => tx.projects.list())).toEqual([]);
    expect(rigs.registry.slugs()).toEqual([]);

    const retry = await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));

    expect(register).toHaveBeenCalledTimes(2);
    expect(retry.status).toBe(201);
    expect(retry.body).toMatchObject({ settings_version: 2 });
    expect(rigs.registry.slugs()).toEqual(['fixture']);
    expect(
      (await rigs.storage.transaction((tx) => tx.projects.list())).map((p) => p.slug),
    ).toEqual(['fixture']);

    const settings = await rigs.rig.json('GET', '/settings/projects/fixture');
    expect(settings.body).toMatchObject({ version: { project: 2 } });
  });

  it('still refuses a slug that has a project row', async () => {
    await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));

    const again = await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));

    expect(again.body).toMatchObject({ error: { code: 'project_exists' } });
  });
});

describe('POST /projects with a folder inside Forge storage', () => {
  it.each([
    ['the memory repository of a project', 'memory/fixture'],
    ['a Worker worktree', 'worktrees/fixture/FX-1'],
    ['the data home itself', ''],
  ])('refuses %s', async (_name, sub) => {
    const res = await rigs.rig.json(
      'POST',
      '/projects',
      fixtureProjectBody(fixture, { local_path: join(fixture.dataHome, sub) }),
    );

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'path_in_data_home' } });
    await nothingSaved();
  });

  it('refuses a link that leads into the data home', async () => {
    const target = join(fixture.dataHome, 'memory', 'linked');
    mkdirSync(target, { recursive: true });
    const link = join(trackTemp(mkdtempSync(join(tmpdir(), 'forge-link-'))), 'clone');
    symlinkSync(target, link, 'junction');

    const res = await rigs.rig.json(
      'POST',
      '/projects',
      fixtureProjectBody(fixture, { local_path: link }),
    );

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'path_in_data_home' } });
    await nothingSaved();
  });
});

describe('GET /projects with an unservable project', () => {
  it('shows config_error on the project the engine skips and on no other', async () => {
    await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));
    await rigs.rig.json(
      'POST',
      '/projects',
      fixtureProjectBody(second, { slug: 'second', prefix: 'SC' }),
    );

    rigs.unservable.set('second', 'stored override is not valid');
    const list = await rigs.rig.json('GET', '/projects');
    const projects = (list.body as { projects: Record<string, unknown>[] }).projects;

    expect(projects.find((p) => p['slug'] === 'second')).toMatchObject({
      config_error: 'stored override is not valid',
    });

    expect(projects.find((p) => p['slug'] === 'fixture')).not.toHaveProperty(
      'config_error',
    );
  });
});
