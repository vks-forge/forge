/**
 * Archiving and unarchiving a project through `PATCH /projects/:slug`.
 *
 * Why: a project that is no longer worked on must stop taking tickets without losing its
 *   history. Archiving has to change the row, stop the registry serving the project (so the
 *   engine finds no runtime) and keep the settings versions; anything other than archiving
 *   is not an operation this API offers, and an unknown project must be a clear 404.
 *
 *   Unarchiving (d-0157) must serve the project again, but only when it can be served: a
 *   folder deleted while archived must leave it archived with a plain 409, not a "ready"
 *   project whose tickets park.
 *
 * Pins: 200 with status archived and the registry empty; settings history kept; 404 for an
 *   unknown slug; 400 for another status or an empty body; archive then unarchive serves it
 *   again with its settings history intact; a missing folder gives 409 project_not_servable
 *   and keeps it archived and unserved; GET /projects lists archived projects with status.
 * Depends on: helpers/projects-rig, helpers/fixture-repo. IO: a real git clone, a loopback socket.
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

afterAll(() => {
  fixture.dispose();
});

beforeEach(async () => {
  rigs = await startProjectsRig(`${fixture.dataHome}/worktrees`);
});

afterEach(async () => {
  await rigs.rig.close();
});

describe('PATCH /projects/:slug', () => {
  it('archives a project: row says archived, the registry stops serving it, nothing is deleted', async () => {
    await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));

    const res = await rigs.rig.json('PATCH', '/projects/fixture', { status: 'archived' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ project: { slug: 'fixture', status: 'archived' } });
    expect(rigs.registry.slugs()).toEqual([]);
    expect(await rigs.config.history('project', 'fixture')).toHaveLength(1);
    expect(rigs.registry.runtime('fixture', undefined)).toBeNull();
  });

  it('404s an unknown project and refuses any other status', async () => {
    expect(
      (await rigs.rig.json('PATCH', '/projects/nope', { status: 'archived' })).status,
    ).toBe(404);

    await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));

    expect(
      (await rigs.rig.json('PATCH', '/projects/fixture', { status: 'onboarding' }))
        .status,
    ).toBe(400);

    expect((await rigs.rig.json('PATCH', '/projects/fixture', {})).status).toBe(400);
  });
});

describe('PATCH /projects/:slug unarchive', () => {
  it('round trip: archived project is listed, then serves again with its history', async () => {
    await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));
    await rigs.rig.json('PATCH', '/projects/fixture', { status: 'archived' });

    const listed = await rigs.rig.json('GET', '/projects');
    expect(listed.body).toMatchObject({
      projects: [{ slug: 'fixture', status: 'archived' }],
    });

    const res = await rigs.rig.json('PATCH', '/projects/fixture', { status: 'ready' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ project: { slug: 'fixture', status: 'ready' } });
    expect(rigs.registry.slugs()).toEqual(['fixture']);
    expect(rigs.registry.runtime('fixture', undefined)).not.toBeNull();
    expect(await rigs.config.history('project', 'fixture')).toHaveLength(1);
  });

  it('409s project_not_servable when the folder is gone and stays archived', async () => {
    await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));
    await rigs.rig.json('PATCH', '/projects/fixture', { status: 'archived' });
    await rigs.storage.transaction(async (tx) => {
      const row = (await tx.projects.list())[0]!;
      await tx.projects.upsert({ ...row, local_path: `${fixture.dataHome}/gone` });
    });

    const res = await rigs.rig.json('PATCH', '/projects/fixture', { status: 'ready' });
    const listed = await rigs.rig.json('GET', '/projects');

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'project_not_servable' } });
    expect(rigs.registry.slugs()).toEqual([]);
    expect(listed.body).toMatchObject({ projects: [{ status: 'archived' }] });
  });

  it('404s unarchiving an unknown project', async () => {
    const res = await rigs.rig.json('PATCH', '/projects/nope', { status: 'ready' });

    expect(res.status).toBe(404);
  });
});
