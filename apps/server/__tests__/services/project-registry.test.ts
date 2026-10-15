/**
 * Project registry: per-project runtimes, runtime registration, and rebuild on a host change.
 *
 * Why: the engine asks the registry for a project's runtime on every use. The runtime must
 *   be the project's own (its clone, its worktree folder under the data home, its base
 *   branch), a project added while the server runs must be served at once, an archived one
 *   must not, and an edited git host must take effect on the next tick without a restart,
 *   while an unrelated settings edit must not rebuild anything. A broken project must not
 *   keep the others from loading, and a failed rebuild must be retried, not cached.
 *
 * Pins: load serves non-archived projects with a clone path; worktree root and base branch
 *   per project; register/archive at runtime; rebuild only when the git host settings changed
 *   (new object) and not for an unrelated edit (same object); failed rebuild throws then
 *   retries; one bad project is skipped with an error log.
 * Depends on: @forge/db (memory), src/services/project-registry. IO: none (no git is run).
 */

import { join } from 'node:path';
import { createMemoryConfigSource, createMemoryStorage } from '@forge/db';
import type { ConfigSource, Project, StorageAdapter } from '@forge/core';
import { createMemorySecretStore } from '@forge/secrets';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProjectRegistry } from '#/services/project-registry.js';
import type { ProjectRegistry } from '#/types/project-registry.types.js';

const DATA = join(process.cwd(), 'data-home', 'worktrees');

const row = (slug: string, over: Partial<Project> = {}): Project => ({
  id: slug,
  slug,
  prefix: slug.slice(0, 2).toUpperCase(),
  local_path: join(process.cwd(), 'clones', slug),
  status: 'ready',
  ecosystems: [],
  harness_defaults: {},
  tier_c_globs: [],
  ...over,
});

const local = (base = 'main') => ({
  git_host: { kind: 'local' as const, remote_path: 'remote.git', base_branch: base },
});

let storage: StorageAdapter;
let config: ConfigSource;
let logs: { level: string; message: string }[];
let registry: ProjectRegistry;

async function seed(project: Project, doc: Record<string, unknown> = local()) {
  await storage.transaction((tx) => tx.projects.upsert(project));
  await config.append({
    scope: 'project',
    project: project.slug,
    doc,
    author: 'test',
    reason: 'seed',
    expectedVersion: 0,
  });
}

beforeEach(() => {
  storage = createMemoryStorage();
  config = createMemoryConfigSource();
  logs = [];
  registry = createProjectRegistry({
    storage,
    config,
    secrets: createMemorySecretStore(),
    worktreesDir: DATA,
    gates: vi.fn(() => []),
    now: () => 0,
    log: (level, message) => logs.push({ level, message }),
  });
});

describe('load', () => {
  it('serves every project that is not archived and has a clone path', async () => {
    await seed(row('alpha'));
    await seed(row('beta'));
    await seed(row('gone', { status: 'archived' }));
    await seed(row('nopath', { local_path: undefined }));

    await registry.load();

    expect(registry.slugs()).toEqual(['alpha', 'beta']);
    expect(
      logs.some((l) => l.level === 'warn' && l.message.includes('no local clone')),
    ).toBe(true);
  });

  it('builds each runtime on its own project: identity, base branch and gates', async () => {
    await seed(row('alpha'), local('main'));
    await seed(row('beta'), local('develop'));
    await registry.load();

    const a = registry.runtime('alpha', await config.project('alpha'));
    const b = registry.runtime('beta', await config.project('beta'));

    expect(a?.config.slug).toBe('alpha');
    expect(b?.config.slug).toBe('beta');
    expect(a?.baseRef).toBe('main');
    expect(b?.baseRef).toBe('develop');
    expect(a?.worktrees).not.toBe(b?.worktrees);
    expect(a?.gitHost).not.toBeNull();
  });

  it('serves a project with no git host (no host, base falls back to main)', async () => {
    await seed(row('plain'), {});
    await registry.load();

    const runtime = registry.runtime('plain', await config.project('plain'));

    expect(runtime?.gitHost).toBeNull();
    expect(runtime?.baseRef).toBe('main');
  });

  it('skips a project that cannot be built, logs it, and still serves the others', async () => {
    await seed(row('good'));
    await seed(row('bad'), {
      git_host: { kind: 'github', owner: 'o', repo: 'r', installation_id: '1' },
    });

    await registry.load();

    expect(registry.slugs()).toEqual(['good']);
    expect(logs.find((l) => l.level === 'error')?.message).toContain(
      'could not be served',
    );
  });

  it('skips a project whose connection row is missing', async () => {
    await seed(row('linked', { connection_id: 'ghost' }), {
      git_host: { kind: 'github', owner: 'o', repo: 'r', installation_id: '1' },
    });

    await registry.load();

    expect(registry.slugs()).toEqual([]);
  });
});

describe('register and archive at runtime', () => {
  it('serves a project as soon as it is registered and drops it when archived', async () => {
    const project = row('late');
    await seed(project);

    expect(registry.runtime('late', undefined)).toBeNull();

    await registry.register(project, await config.project('late'));
    expect(registry.runtime('late', undefined)?.config.slug).toBe('late');

    registry.archive('late');
    expect(registry.runtime('late', undefined)).toBeNull();
    expect(registry.slugs()).toEqual([]);
  });

  it('check() builds without keeping and throws for a project it cannot serve', async () => {
    const good = row('fine');
    await expect(
      registry.check(good, (await config.project('fine')).config.project),
    ).resolves.toBeUndefined();

    expect(registry.slugs()).toEqual([]);
    await expect(
      registry.check(
        row('nopath', { local_path: undefined }),
        (await config.project('fine')).config.project,
      ),
    ).rejects.toThrow(/no local clone path/);
  });
});

describe('rebuild when the git host settings change', () => {
  async function edit(
    slug: string,
    doc: Record<string, unknown>,
    expectedVersion: number,
  ) {
    await config.append({
      scope: 'project',
      project: slug,
      doc,
      author: 'test',
      reason: 'edit',
      expectedVersion,
    });

    return config.project(slug);
  }

  it('builds a new runtime for a new git host and keeps it until the host changes again', async () => {
    await seed(row('alpha'), local('main'));
    await registry.load();
    const before = registry.runtime('alpha', await config.project('alpha'));

    const view = await edit('alpha', local('develop'), 1);
    const after = registry.runtime('alpha', view);

    expect(after).not.toBe(before);
    expect(after?.baseRef).toBe('develop');
    expect(registry.runtime('alpha', view)).toBe(after);
    expect(logs.some((l) => l.message.includes('rebuilt'))).toBe(true);
  });

  it('keeps the same runtime for an edit that leaves the git host alone', async () => {
    await seed(row('alpha'), local('main'));
    await registry.load();
    const before = registry.runtime('alpha', await config.project('alpha'));

    const view = await edit(
      'alpha',
      { ...local('main'), checks: [{ name: 'test', role: 'test', command: 'make' }] },
      1,
    );

    expect(registry.runtime('alpha', view)).toBe(before);
    expect(logs.some((l) => l.message.includes('rebuilt'))).toBe(false);
  });

  it('never touches another project when one project changes', async () => {
    await seed(row('alpha'), local('main'));
    await seed(row('beta'), local('main'));
    await registry.load();
    const beta = registry.runtime('beta', await config.project('beta'));

    await edit('alpha', local('develop'), 1);
    registry.runtime('alpha', await config.project('alpha'));

    expect(registry.runtime('beta', await config.project('beta'))).toBe(beta);
  });

  it('reports a failed rebuild and tries again on the next use instead of caching it', async () => {
    await seed(row('alpha'), local('main'));
    await registry.load();
    const good = registry.runtime('alpha', await config.project('alpha'));

    const broken = await edit(
      'alpha',
      { git_host: { kind: 'github', owner: 'o', repo: 'r', installation_id: '1' } },
      1,
    );

    expect(() => registry.runtime('alpha', broken)).toThrow(
      /no App id and no connection/,
    );

    expect(() => registry.runtime('alpha', broken)).toThrow(
      /no App id and no connection/,
    );

    const fixed = await edit('alpha', local('trunk'), 2);

    expect(registry.runtime('alpha', fixed)?.baseRef).toBe('trunk');
    expect(registry.runtime('alpha', fixed)).not.toBe(good);

    // Changing the host again rebuilds again.
    const back = await edit('alpha', local('main'), 3);
    expect(registry.runtime('alpha', back)?.baseRef).toBe('main');
  });
});
