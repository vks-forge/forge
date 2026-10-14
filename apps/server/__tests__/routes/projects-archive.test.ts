/**
 * Archiving a project through `PATCH /projects/:slug`.
 *
 * Why: a project that is no longer worked on must stop taking tickets without losing its
 *   history. Archiving has to change the row, stop the registry serving the project (so the
 *   engine finds no runtime) and keep the settings versions; anything other than archiving
 *   is not an operation this API offers, and an unknown project must be a clear 404.
 *
 * Pins: 200 with status archived and the registry empty; settings history kept; 404 for an
 *   unknown slug; 400 for another status or an empty body.
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
      (await rigs.rig.json('PATCH', '/projects/fixture', { status: 'ready' })).status,
    ).toBe(400);

    expect((await rigs.rig.json('PATCH', '/projects/fixture', {})).status).toBe(400);
  });
});
