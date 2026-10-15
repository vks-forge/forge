/**
 * Projects API: register an existing clone, list, archive.
 *
 * Why: this is how a second (and third) repository joins a running Forge. A project saved
 *   with a folder that is not a clone, a base branch that does not exist, a colliding ticket
 *   prefix, or a git host the server cannot build would fail days later inside a ticket, so
 *   each of those must be refused at registration with nothing saved. A good registration
 *   must leave a project that the engine can serve at once: row, first settings version
 *   (with the author who sent it) and a runtime in the rigs.registry.
 *
 * Pins: 201 with row and settings version 1; the registry serves it; connection-linked
 *   projects resolve the host from the connection; every refusal (relative path, not a repo,
 *   missing branch, no/both host, unknown or disabled connection, duplicate slug, prefix or
 *   folder, bad settings) leaves no row and no settings; PATCH archives and stops serving.
 * Depends on: helpers/http-rig, helpers/fixture-repo, src/routes, src/services/project-rigs.registry.
 *   IO: real git repositories in the OS temp dir, in-memory storage, settings and secrets.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

describe('POST /projects', () => {
  it('registers a clone: row, first settings version by the author, and a served runtime', async () => {
    const res = await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      project: {
        id: 'fixture',
        slug: 'fixture',
        prefix: 'FX',
        local_path: fixture.root,
        status: 'ready',
        ecosystems: [],
      },
      settings_version: 1,
    });

    expect(JSON.stringify(res.body)).not.toContain('tier_c_globs');

    const settings = await rigs.rig.json('GET', '/settings/projects/fixture');
    expect(settings.body).toMatchObject({
      version: { project: 1 },
      config: {
        project: {
          checks: [
            { name: 'lint', role: 'lint', command: 'node scripts/lint.mjs' },
            { name: 'test', role: 'test', command: 'npm test' },
          ],
          git_host: { kind: 'local', base_branch: 'main' },
        },
      },
    });

    const history = await rigs.rig.json('GET', '/settings/projects/fixture/history');
    expect(history.body).toMatchObject({
      versions: [{ version: 1, author: 'tester', reason: 'fixture project' }],
    });

    const runtime = rigs.registry.runtime(
      'fixture',
      await rigs.config.project('fixture'),
    );

    expect(rigs.registry.slugs()).toEqual(['fixture']);
    expect(runtime?.gitHost).not.toBeNull();
    expect(runtime?.baseRef).toBe('main');
  });

  it('lists every project, archived ones included', async () => {
    await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));
    await rigs.rig.json(
      'POST',
      '/projects',
      fixtureProjectBody(second, { slug: 'second', prefix: 'SC' }),
    );

    const list = await rigs.rig.json('GET', '/projects');

    expect(
      (list.body as { projects: { slug: string }[] }).projects.map((p) => p.slug),
    ).toEqual(['fixture', 'second']);
  });

  it('links a project to a connection and resolves the host through it', async () => {
    const made = await rigs.rig.json('POST', '/github/connections', {
      account: 'Acme Inc',
      app_id: '4242',
      private_key_pem: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
    });

    const id = (made.body as { connection: { id: string } }).connection.id;
    const res = await rigs.rig.json('POST', '/projects', {
      slug: 'fixture',
      prefix: 'FX',
      local_path: fixture.root,
      base_branch: 'main',
      connection_id: id,
      repo_full_name: 'acme-inc/fixture',
      installation_id: '99',
      author: 'tester',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      project: { connection_id: id, repo_full_name: 'acme-inc/fixture' },
    });

    const stored = await rigs.config.project('fixture');
    expect(stored.config.project.git_host).toMatchObject({
      kind: 'github',
      owner: 'acme-inc',
      repo: 'fixture',
      installation_id: '99',
    });

    expect(JSON.stringify(stored)).not.toContain('PRIVATE KEY');
    expect(rigs.registry.runtime('fixture', stored)?.gitHost).not.toBeNull();
  });

  it.each([
    ['a relative path', { local_path: 'relative/dir' }, 400, 'invalid_local_path'],
    [
      'a folder that is not a repository',
      { local_path: 'ROOT_PARENT' },
      400,
      'not_a_repository',
    ],
    [
      'a base branch that does not exist',
      { base_branch: 'develop', git_host: undefined },
      400,
      'base_branch_missing',
    ],
    ['an unknown key', { surprise: true }, 400, 'invalid_request'],
    ['a bad prefix', { prefix: 'fx' }, 400, 'invalid_request'],
    ['invalid settings', { settings: { profile: 'cobol' } }, 400, 'invalid_request'],
  ])('refuses %s and saves nothing', async (_name, over, status, code) => {
    const body = fixtureProjectBody(fixture, over);
    if (body['local_path'] === 'ROOT_PARENT') {
      body['local_path'] = trackTemp(mkdtempSync(join(tmpdir(), 'forge-plain-')));
    }

    if (body['git_host'] === undefined) {
      body['git_host'] = {
        kind: 'local',
        remote_path: fixture.remote,
        base_branch: 'develop',
      };
    }

    const res = await rigs.rig.json('POST', '/projects', body);

    expect(res.status).toBe(status);
    expect(res.body).toMatchObject({ error: { code } });
    await nothingSaved();
  });

  it('needs exactly one way to name the git host', async () => {
    const none = fixtureProjectBody(fixture);
    delete none['git_host'];

    expect((await rigs.rig.json('POST', '/projects', none)).status).toBe(400);

    const both = fixtureProjectBody(fixture, {
      connection_id: 'acme',
      repo_full_name: 'a/b',
      installation_id: '1',
    });

    expect((await rigs.rig.json('POST', '/projects', both)).status).toBe(400);
    await nothingSaved();
  });

  it('404s an unknown connection and 409s a disabled one', async () => {
    const body = {
      slug: 'fixture',
      prefix: 'FX',
      local_path: fixture.root,
      connection_id: 'ghost',
      repo_full_name: 'a/b',
      installation_id: '1',
      author: 'tester',
    };

    const unknown = await rigs.rig.json('POST', '/projects', body);
    expect(unknown.status).toBe(404);
    expect(unknown.body).toMatchObject({ error: { code: 'connection_not_found' } });

    await rigs.storage.transaction((tx) =>
      tx.githubConnections.upsert({
        id: 'off',
        account: 'x',
        app_id: '1',
        key_secret_name: 'github/off/key',
        status: 'disabled',
        created_at: '2026-10-14T00:00:00.000Z',
      }),
    );

    const off = await rigs.rig.json('POST', '/projects', {
      ...body,
      connection_id: 'off',
    });

    expect(off.status).toBe(409);
    expect(off.body).toMatchObject({ error: { code: 'connection_disabled' } });
    await nothingSaved();
  });

  it('refuses a second project with the same slug, ticket prefix or folder', async () => {
    await rigs.rig.json('POST', '/projects', fixtureProjectBody(fixture));

    const slug = await rigs.rig.json(
      'POST',
      '/projects',
      fixtureProjectBody(second, { prefix: 'SC' }),
    );

    const prefix = await rigs.rig.json(
      'POST',
      '/projects',
      fixtureProjectBody(second, { slug: 'other' }),
    );

    const folder = await rigs.rig.json(
      'POST',
      '/projects',
      fixtureProjectBody(fixture, { slug: 'other', prefix: 'SC' }),
    );

    expect(slug.body).toMatchObject({ error: { code: 'project_exists' } });
    expect(prefix.body).toMatchObject({ error: { code: 'prefix_in_use' } });
    expect(folder.body).toMatchObject({ error: { code: 'path_in_use' } });
    expect([slug.status, prefix.status, folder.status]).toEqual([409, 409, 409]);
    expect(rigs.registry.slugs()).toEqual(['fixture']);
  });
});
