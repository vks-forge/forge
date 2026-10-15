/**
 * Projects API: two creates racing for the same slug, prefix or folder.
 *
 * Why: the slug and the ticket prefix identify a project everywhere (ticket ids are
 *   `<PREFIX>-<n>`, settings and memory are keyed by slug). Two registrations that both pass
 *   an up-front "is it free" read and then both save would overwrite each other: one project
 *   silently replaced by another, or two projects whose ticket ids collide. The decision has to
 *   be made inside the transaction that saves the row, so exactly one of two racing requests
 *   wins and the other is told why.
 *
 * Pins: with both requests held between the early checks and the save, exactly one of two
 *   creates for the same slug, prefix or folder succeeds (201) and the other is 409
 *   `project_exists` / `prefix_in_use` / `path_in_use`; one row remains and one runtime is served.
 * Depends on: helpers/fixture-repo, helpers/projects-rig, src/routes.
 *   IO: real git repositories in the OS temp dir, in-memory storage.
 */

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
  vi.restoreAllMocks();
  await rigs.rig.close();
});

/** Holds every `check` until two requests have reached it, so both passed the early reads. */
function holdBothAtCheck(): void {
  const original = rigs.registry.check.bind(rigs.registry);
  let arrived = 0;
  let release: () => void = () => undefined;
  const both = new Promise<void>((resolve) => {
    release = resolve;
  });

  vi.spyOn(rigs.registry, 'check').mockImplementation(async (...args) => {
    arrived += 1;
    if (arrived >= 2) {
      release();
    }

    await both;

    return original(...args);
  });
}

describe('POST /projects racing', () => {
  it.each([
    ['slug', { prefix: 'SC' }, 'project_exists'],
    ['prefix', { slug: 'other' }, 'prefix_in_use'],
  ])(
    'lets exactly one of two creates with the same %s win',
    async (_what, over, code) => {
      holdBothAtCheck();

      const [a, b] = await Promise.all([
        rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture)),
        rigs.rig.json('POST', '/projects', fixtureProjectBody(second, over)),
      ]);

      expect([a.status, b.status].sort()).toEqual([201, 409]);
      const loser = a.status === 409 ? a : b;

      expect(loser.body).toMatchObject({ error: { code } });
      expect(await rigs.storage.transaction((tx) => tx.projects.list())).toHaveLength(1);
      expect(rigs.registry.slugs()).toHaveLength(1);
    },
  );

  it('lets exactly one of two creates for the same folder win', async () => {
    holdBothAtCheck();

    const [a, b] = await Promise.all([
      rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture)),
      rigs.rig.json(
        'POST',
        '/projects',
        fixtureProjectBody(fixture, { slug: 'other', prefix: 'SC' }),
      ),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect((a.status === 409 ? a : b).body).toMatchObject({
      error: { code: 'path_in_use' },
    });

    expect(await rigs.storage.transaction((tx) => tx.projects.list())).toHaveLength(1);
  });
});
