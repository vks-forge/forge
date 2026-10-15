/**
 * Registering a project creates its memory repository.
 *
 * Why: the Director needs a place to write what it learns from the first ticket on, so a
 *   project must not exist without its private memory repository in the data home. And a
 *   machine where that repository cannot be created (no git, a read-only folder) must say
 *   so at registration, with nothing saved, rather than fail at the first proposal.
 *
 * Pins: POST /projects leaves `<memory root>/<slug>/` as a git repository with one initial
 *   commit; a failing init gives an error and no project row, settings or served runtime.
 * Depends on: helpers/projects-rig, helpers/fixture-repo, @forge/memory.
 *   IO: a real git clone fixture, a temp memory folder, a loopback socket.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProjectMemory } from '@forge/memory';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFixtureRepo, fixtureProjectBody } from '#tests/helpers/fixture-repo.js';
import type { FixtureRepo } from '#tests/helpers/fixture-repo.js';
import { startProjectsRig } from '#tests/helpers/projects-rig.js';
import type { ProjectsRig } from '#tests/helpers/projects-rig.js';
import { inertMemory } from '#tests/helpers/route-extras.js';

let fixture: FixtureRepo;
let memoryRoot: string;
let rigs: ProjectsRig | undefined;

beforeAll(() => {
  fixture = createFixtureRepo();
}, 120_000);

afterAll(() => {
  fixture.dispose();
});

beforeEach(() => {
  memoryRoot = mkdtempSync(join(tmpdir(), 'forge-projmem-'));
});

afterEach(async () => {
  await rigs?.rig.close();
  rigs = undefined;
  rmSync(memoryRoot, { recursive: true, force: true });
});

describe('POST /projects and project memory', () => {
  it('creates the private memory repository with one initial commit', async () => {
    rigs = await startProjectsRig(
      `${fixture.dataHome}/worktrees`,
      createProjectMemory({ rootDir: memoryRoot, now: () => new Date() }),
    );

    const res = await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));

    expect(res.status).toBe(201);
    expect(existsSync(join(memoryRoot, 'fixture', '.git'))).toBe(true);
    expect(
      execFileSync('git', ['rev-list', '--count', 'HEAD'], {
        cwd: join(memoryRoot, 'fixture'),
        encoding: 'utf8',
      }).trim(),
    ).toBe('1');
  });

  it('saves nothing when the memory repository cannot be created', async () => {
    rigs = await startProjectsRig(`${fixture.dataHome}/worktrees`, {
      ...inertMemory,
      init: () => Promise.reject(new Error('git is not installed')),
    });

    const res = await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));

    expect(res.status).toBe(500);
    expect(await rigs.storage.transaction((tx) => tx.projects.list())).toEqual([]);
    expect(await rigs.config.history('project', 'fixture')).toEqual([]);
    expect(rigs.registry.slugs()).toEqual([]);
  });
});
