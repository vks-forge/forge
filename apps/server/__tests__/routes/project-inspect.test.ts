/**
 * Project inspect API: the dry run behind the new-project form.
 *
 * Why: the form must say a folder is wrong while the user is still typing it, and must never
 *   promise what `POST /projects` then refuses. So inspect has to refuse with the same codes
 *   and statuses as create, and, for a usable clone, return what the form pre-fills (branches,
 *   checked-out branch, detected checks, a free slug and prefix) while creating nothing.
 *
 * Pins: a clone gives branches, current branch, node checks from package.json and a free
 *   suggestion; a taken slug/prefix is not suggested; each refusal (relative path, data home,
 *   not a folder, missing base branch, folder already a project, unknown key) has create's
 *   code; nothing is saved or served after an inspect. Any folder inspects (d-0124): no git
 *   gives state none and a snapshot count, a folder inside a repository gives the top and
 *   subfolder with checks from the subfolder, an empty repository is accepted.
 * Depends on: helpers/fixture-repo, helpers/projects-rig, helpers/temp, src/routes.
 *   IO: real git repositories in the OS temp dir, in-memory storage.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
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
  git(fixture.root, 'branch', 'develop');
}, 120_000);

afterAll(() => fixture.dispose());

beforeEach(async () => {
  rigs = await startProjectsRig(`${fixture.dataHome}/worktrees`);
});

afterEach(async () => {
  await rigs.rig.close();
});

const inspect = (body: Record<string, unknown>) =>
  rigs.rig.json('POST', '/projects/inspect', body);

describe('POST /projects/inspect', () => {
  it('describes a clone: branches, current branch, detected checks and a free name', async () => {
    const res = await inspect({ local_path: fixture.root });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      local_path: fixture.root,
      current_branch: 'main',
      base_branch: 'main',
      branches: ['develop', 'main'],
      branches_truncated: false,
      ecosystems: ['node'],
      checks: [
        { name: 'lint', role: 'lint', command: 'npm run lint' },
        { name: 'test', role: 'test', command: 'npm run test' },
      ],
      suggested_prefix: expect.stringMatching(/^[A-Z][A-Z0-9]{0,9}$/),
    });
  });

  it('honours a base branch that exists and refuses one that does not', async () => {
    const ok = await inspect({ local_path: fixture.root, base_branch: 'develop' });
    expect(ok.body).toMatchObject({ base_branch: 'develop', current_branch: 'main' });

    const missing = await inspect({ local_path: fixture.root, base_branch: 'nope' });
    expect(missing.status).toBe(400);
    expect(missing.body).toMatchObject({ error: { code: 'base_branch_missing' } });
  });

  it('does not suggest a slug or prefix another project holds', async () => {
    const first = await inspect({ local_path: fixture.root });
    const { suggested_slug: slug, suggested_prefix: prefix } = first.body as {
      suggested_slug: string;
      suggested_prefix: string;
    };

    const other = createFixtureRepo();
    try {
      const made = await rigs.rig.json(
        'POST',
        '/projects',
        fixtureProjectBody(other, { slug, prefix }),
      );

      expect(made.status).toBe(201);

      const again = await inspect({ local_path: fixture.root });
      expect(again.body).toMatchObject({
        suggested_slug: `${slug}-2`,
        suggested_prefix: `${prefix}2`,
      });
    } finally {
      other.dispose();
    }
  });

  it.each([
    ['a relative path', () => 'relative/dir', 400, 'invalid_local_path'],
    [
      'a folder inside the data home',
      () => join(fixture.dataHome, 'memory', 'x'),
      400,
      'path_in_data_home',
    ],
    [
      'a folder that does not exist',
      () => join(tmpdir(), 'forge-inspect-nothing-here'),
      400,
      'not_a_directory',
    ],
  ])('refuses %s with the code create uses', async (_name, folder, status, code) => {
    const res = await inspect({ local_path: folder() });

    expect(res.status).toBe(status);
    expect(res.body).toMatchObject({ error: { code } });
  });

  it('refuses a folder that already is a project, and an unknown key', async () => {
    await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));

    const taken = await inspect({ local_path: fixture.root });
    expect(taken.status).toBe(409);
    expect(taken.body).toMatchObject({ error: { code: 'path_in_use' } });

    const extra = await inspect({ local_path: fixture.root, surprise: true });
    expect(extra.status).toBe(400);
    expect(extra.body).toMatchObject({ error: { code: 'invalid_request' } });
  });

  it('creates and serves nothing', async () => {
    await inspect({ local_path: fixture.root });

    expect(await rigs.storage.transaction((tx) => tx.projects.list())).toEqual([]);
    expect(rigs.registry.slugs()).toEqual([]);
  });

  it('needs the install token like every route but /health', async () => {
    const res = await rigs.rig.json(
      'POST',
      '/projects/inspect',
      { local_path: fixture.root },
      { authorization: '' },
    );

    expect([401, 403]).toContain(res.status);
  });
});

describe('POST /projects/inspect: any folder (d-0124)', () => {
  it('reports a repository with its git facts and no snapshot', async () => {
    const res = await inspect({ local_path: fixture.root });

    expect(res.body).toMatchObject({
      git: {
        state: 'repo',
        subfolder: null,
        has_commits: true,
        dirty: false,
        remote: null,
      },
      snapshot: null,
    });
  });

  it('reports a folder with no git: state none, a snapshot count, main as the base', async () => {
    const dir = trackTemp(mkdtempSync(join(tmpdir(), 'forge-plain-')));
    writeFileSync(
      join(dir, 'package.json'),
      '{"name":"p","scripts":{"test":"node t.js"}}\n',
    );

    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'node_modules', 'x.js'), 'ignored');

    const res = await inspect({ local_path: dir });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      base_branch: 'main',
      current_branch: null,
      branches: [],
      ecosystems: ['node'],
      git: { state: 'none', repo_root: null, has_commits: false },
      snapshot: { files: 1, has_gitignore: false, truncated: false },
    });
  });

  it('reports a folder inside a repository: the top, the subfolder, checks from the subfolder', async () => {
    const sub = join(fixture.root, 'packages', 'web');
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, 'package.json'), '{"name":"web","scripts":{"lint":"x"}}\n');

    const res = await inspect({ local_path: sub });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      current_branch: 'main',
      branches: expect.arrayContaining(['main']),
      git: { state: 'inside_repo', subfolder: 'packages/web', has_commits: true },
      snapshot: null,
    });

    expect(
      (res.body as { checks: { role: string }[] }).checks.map((c) => c.role),
    ).toContain('lint');
  });

  it('accepts an empty repository: no commits yet is reported, not refused', async () => {
    const dir = trackTemp(mkdtempSync(join(tmpdir(), 'forge-empty-')));
    git(dir, 'init', '-b', 'trunk');

    const res = await inspect({ local_path: dir });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      base_branch: 'trunk',
      git: { state: 'repo', has_commits: false },
    });
  });
});
