/**
 * Projects API: any folder can be a project, with or without git (d-0124).
 *
 * Why: the user's folder is the one thing registration must not get wrong. A folder with no
 *   git must not be turned into a repository without the user choosing how; a folder inside
 *   a repository must not silently become the whole repository (or a nested one); a refused
 *   request must leave the folder exactly as it was; and a project with no remote must be
 *   built on a host that merges locally. These run the real route, real git and the real
 *   project registry over throwaway folders.
 *
 * Pins: no git and no `git_setup` => 400 `git_setup_required`, folder untouched; snapshot =>
 *   a repository with the snapshot commit and a `local_repo` host; init only => registered, an
 *   empty repository, dispatch is refused with a first-commit message; inside a repository
 *   without `scope` => 400 `scope_required`; scope root registers the repository top; scope
 *   subfolder stores `repo_root` + `subfolder` and the Worker path is that subfolder; a
 *   conflict is refused before git is initialised; a repository with no host given merges
 *   locally on its current branch.
 * Depends on: helpers/fixture-repo, helpers/projects-rig, helpers/temp. IO: git, temp folders.
 */

import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createFixtureRepo,
  fixtureProjectBody,
  git,
} from '#tests/helpers/fixture-repo.js';
import type { FixtureRepo } from '#tests/helpers/fixture-repo.js';
import { startProjectsRig } from '#tests/helpers/projects-rig.js';
import type { ProjectsRig } from '#tests/helpers/projects-rig.js';
import { trackTemp } from '#tests/helpers/temp.js';

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

const plainFolder = (): string => {
  const dir = trackTemp(mkdtempSync(join(tmpdir(), 'forge-any-')));
  writeFileSync(join(dir, 'readme.txt'), 'hello\n');

  return dir;
};

const body = (local_path: string, over: Record<string, unknown> = {}) => ({
  slug: 'plain',
  prefix: 'PL',
  local_path,
  author: 'tester',
  ...over,
});

const post = (b: Record<string, unknown>) => rigs.rig.json('POST', '/projects', b);

describe('POST /projects on any folder', () => {
  it('refuses a folder with no git and no git_setup, and leaves it untouched', async () => {
    const dir = plainFolder();

    const res = await post(body(dir));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'git_setup_required' } });
    expect(existsSync(join(dir, '.git'))).toBe(false);
    expect(await rigs.storage.transaction((tx) => tx.projects.list())).toEqual([]);
  });

  it('snapshot: starts the repository, commits the files and serves a local-merge project', async () => {
    const dir = plainFolder();

    const res = await post(body(dir, { git_setup: { mode: 'snapshot' } }));

    expect(res.status).toBe(201);
    expect(git(dir, 'log', '-1', '--format=%s')).toBe('Initial snapshot (Forge)');
    expect(git(dir, 'ls-files').split('\n').sort()).toEqual(['.gitignore', 'readme.txt']);

    const stored = await rigs.config.project('plain');
    expect(stored.config.project.git_host).toEqual({
      kind: 'local_repo',
      base_branch: 'main',
    });

    expect(rigs.registry.runtime('plain', stored)?.gitHost).not.toBeNull();
  });

  it('init only: registers, but dispatch is refused until there is a first commit', async () => {
    const dir = plainFolder();

    const res = await post(body(dir, { git_setup: { mode: 'init_only' } }));

    expect(res.status).toBe(201);
    expect(git(dir, 'rev-parse', '--git-dir')).toBe('.git');
    expect(() => git(dir, 'rev-parse', '--verify', 'HEAD')).toThrow();

    const runtime = rigs.registry.runtime('plain', await rigs.config.project('plain'));

    await expect(
      runtime?.worktrees.create('PL-1' as never, 'feat/pl-1', 'main'),
    ).rejects.toThrow(/no commit yet.*first commit/);
  });

  it('refuses a folder inside a repository until the user picks a scope', async () => {
    const sub = join(fixture.root, 'src');

    const res = await post(body(sub));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'scope_required' } });
    expect(await rigs.storage.transaction((tx) => tx.projects.list())).toEqual([]);
  });

  it('scope root: the project is the repository top, not the chosen folder', async () => {
    const res = await post(body(join(fixture.root, 'src'), { scope: { mode: 'root' } }));

    expect(res.status).toBe(201);
    const [row] = await rigs.storage.transaction((tx) => tx.projects.list());

    expect(row?.local_path?.toLowerCase()).toBe(
      fixture.root.replaceAll('\\', '/').toLowerCase(),
    );

    expect(row?.repo_root).toBeUndefined();
    expect(row?.subfolder).toBeUndefined();
  });

  it('scope subfolder: stores the repository top and subfolder, and the Worker path is the subfolder', async () => {
    const sub = join(fixture.root, 'src');

    const res = await post(body(sub, { scope: { mode: 'subfolder' } }));

    expect(res.status).toBe(201);
    const [row] = await rigs.storage.transaction((tx) => tx.projects.list());

    expect(row).toMatchObject({ local_path: sub, subfolder: 'src' });
    expect(row?.repo_root?.toLowerCase()).toBe(
      fixture.root.replaceAll('\\', '/').toLowerCase(),
    );

    const runtime = rigs.registry.runtime('plain', await rigs.config.project('plain'));
    const wt = await runtime?.worktrees.create('PL-1' as never, 'feat/pl-1', 'main');

    expect(wt?.path.endsWith('/PL-1/src')).toBe(true);
    await runtime?.worktrees.remove(wt?.path ?? '');
    git(fixture.root, 'branch', '-D', 'feat/pl-1');
  });

  it('refuses a clash before it touches the folder', async () => {
    await post(fixtureProjectBody(fixture));
    const dir = plainFolder();

    const res = await post(
      body(dir, { slug: 'fixture', prefix: 'ZZ', git_setup: { mode: 'snapshot' } }),
    );

    expect(res.status).toBe(409);
    expect(existsSync(join(dir, '.git'))).toBe(false);
  });

  it('a repository with no host given merges locally on its current branch', async () => {
    const res = await post(body(fixture.root));

    expect(res.status).toBe(201);
    const stored = await rigs.config.project('plain');

    expect(stored.config.project.git_host).toEqual({
      kind: 'local_repo',
      base_branch: 'main',
    });
  });
});
