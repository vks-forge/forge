/**
 * Project detection API: ecosystems recorded at create, and "what does Forge detect here".
 *
 * Why: a project whose row says "no ecosystems" tells the owner nothing about what Forge
 *   found, and a client that sends its own list could lie or leave it out. The server therefore
 *   detects in the folder itself when a project is created, shows what it finds (ecosystems,
 *   suggested checks, the setup steps it would run before each ticket) for a registered project,
 *   and can look again after the project's files changed, without touching the settings (empty
 *   settings keep meaning "detect from the diff"). The wizard's inspection carries the setup too.
 *   Each served project also carries the worktree preparer that runs those steps (d-0180).
 *
 * Pins: create records the ecosystems the folder holds; GET answers ecosystems, checks and setup
 *   and writes nothing; POST stores the ecosystems on the row; both 404 for an unknown project;
 *   inspect carries the setup; the registry's runtime has a preparer.
 * Depends on: helpers/fixture-repo, helpers/projects-rig, src/routes. IO: real git repository in the OS temp dir, in-memory storage.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFixtureRepo, fixtureProjectBody } from '#tests/helpers/fixture-repo.js';
import type { FixtureRepo } from '#tests/helpers/fixture-repo.js';
import { startProjectsRig } from '#tests/helpers/projects-rig.js';
import type { ProjectsRig } from '#tests/helpers/projects-rig.js';

let fixture: FixtureRepo;
let rigs: ProjectsRig;

beforeAll(() => {
  fixture = createFixtureRepo();
}, 120_000);

afterAll(() => fixture.dispose());

beforeEach(async () => {
  rigs = await startProjectsRig(`${fixture.dataHome}/worktrees`);
});

afterEach(async () => {
  await rigs.rig.close();
});

const rowOf = async (slug: string) =>
  (await rigs.storage.transaction((tx) => tx.projects.list())).find(
    (p) => p.slug === slug,
  );

describe('POST /projects', () => {
  it('records the ecosystems the server detects in the folder, not a list from the client', async () => {
    const res = await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ project: { ecosystems: ['node'] } });
    expect((await rowOf('fixture'))?.ecosystems).toEqual(['node']);
  });

  it('serves a runtime that can prepare a worktree', async () => {
    await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));

    const runtime = rigs.registry.runtime(
      'fixture',
      await rigs.config.project('fixture'),
    );

    expect(runtime?.prepare).toBeDefined();
  });
});

describe('GET and POST /projects/:slug/detected', () => {
  it('shows what Forge detects and writes nothing', async () => {
    await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));
    const project = await rowOf('fixture');
    await rigs.storage.transaction((tx) =>
      tx.projects.upsert({ ...project!, ecosystems: [] }),
    );

    const res = await rigs.rig.json('GET', '/projects/fixture/detected');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ecosystems: ['node'],
      checks: [
        { name: 'lint', role: 'lint' },
        { name: 'test', role: 'test' },
      ],
      setup: [{ name: expect.any(String), command: expect.stringContaining('install') }],
    });

    expect((await rowOf('fixture'))?.ecosystems).toEqual([]);
  });

  it('looks again and stores the ecosystems on the project row', async () => {
    await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));
    const project = await rowOf('fixture');
    await rigs.storage.transaction((tx) =>
      tx.projects.upsert({ ...project!, ecosystems: [] }),
    );

    const res = await rigs.rig.json('POST', '/projects/fixture/detected');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ecosystems: ['node'] });
    expect((await rowOf('fixture'))?.ecosystems).toEqual(['node']);
  });

  it.each(['GET', 'POST'] as const)(
    '%s answers 404 for an unknown project',
    async (method) => {
      const res = await rigs.rig.json(method, '/projects/nope/detected');

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ error: { code: 'project_not_found' } });
    },
  );
});

describe('POST /projects/inspect', () => {
  it('carries the setup steps Forge would run before each ticket', async () => {
    const res = await rigs.rig.json('POST', '/projects/inspect', {
      local_path: fixture.root,
    });

    expect(res.body).toMatchObject({
      setup: [{ command: expect.stringContaining('install') }],
    });
  });
});
