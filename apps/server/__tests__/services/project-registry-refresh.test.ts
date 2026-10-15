/**
 * Project registry refresh: runtimes follow the GitHub connection after load.
 *
 * Why: a project's runtime is built on its GitHub connection once, at load. If the
 *   connection is re-pointed, disabled or removed afterwards, a runtime that is never
 *   rebuilt keeps minting tokens for the old App. `refresh()` runs before each tick and
 *   must rebuild on a change, keep the runtime when nothing changed (identity), stop serving
 *   a project whose connection is gone (fail closed) and serve it again once it is back.
 *
 * Pins: rebuild on a changed connection, no rebuild when unchanged, drop on a missing
 *   connection and recover, drop on archive.
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
  registry = createProjectRegistry({
    storage,
    config,
    secrets: createMemorySecretStore(),
    worktreesDir: DATA,
    gates: vi.fn(() => []),
    now: () => 0,
    log: () => undefined,
  });
});

describe('refresh', () => {
  const conn = (over: Record<string, unknown> = {}) => ({
    id: 'acme',
    account: 'Acme',
    app_id: '1',
    key_secret_name: 'github/acme/key',
    status: 'active' as const,
    created_at: '2026-10-14T00:00:00.000Z',
    ...over,
  });

  async function linked() {
    await storage.transaction((tx) => tx.githubConnections.upsert(conn()));
    await seed(row('alpha', { connection_id: 'acme' }), local('main'));
    await registry.load();
  }

  it('rebuilds a runtime whose connection changed after load', async () => {
    await linked();
    const before = registry.runtime('alpha', undefined);

    await storage.transaction((tx) =>
      tx.githubConnections.upsert(conn({ status: 'disabled' })),
    );

    await registry.refresh();

    expect(registry.runtime('alpha', undefined)).not.toBe(before);
    expect(registry.slugs()).toEqual(['alpha']);
  });

  it('keeps the runtime when nothing it depends on changed', async () => {
    await linked();
    const before = registry.runtime('alpha', undefined);

    await registry.refresh();

    expect(registry.runtime('alpha', undefined)).toBe(before);
  });

  it('stops serving a project whose connection disappeared, and serves it again when it is back', async () => {
    await linked();
    await storage.transaction((tx) => tx.githubConnections.delete('acme'));

    await registry.refresh();

    expect(registry.slugs()).toEqual([]);

    await storage.transaction((tx) => tx.githubConnections.upsert(conn()));
    await registry.refresh();

    expect(registry.slugs()).toEqual(['alpha']);
  });

  it('drops a project that was archived', async () => {
    await linked();
    await storage.transaction((tx) =>
      tx.projects.upsert(row('alpha', { connection_id: 'acme', status: 'archived' })),
    );

    await registry.refresh();

    expect(registry.slugs()).toEqual([]);
  });
});
