/**
 * The temporary project.yaml bridge: first start registers the project, later starts never
 * look at the file again.
 *
 * Why: until the projects API exists the only place a project is described is
 *   `.forge/project.yaml`. The server must turn it into database rows exactly once (the
 *   identity row and a first, attributed settings version) so that from then on the
 *   settings page owns it: if every start re-read the yaml, an edit made in the UI would
 *   be silently undone at the next restart. A start that died halfway through the import
 *   must finish on the next one instead of failing on the half that already exists.
 *
 * Pins: first import writes the row and settings version 1 by author "import"; the
 *   returned config is identity plus effective settings; a second start works with the
 *   file gone and keeps UI edits; a missing file on an empty database fails with the path;
 *   an interrupted import (settings saved, row missing) completes.
 * Depends on: src/services/project-import, @forge/db (memory adapters), helpers/temp. IO: a temp yaml file.
 */

import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMemoryConfigSource, createMemoryStorage } from '@forge/db';
import type { ConfigSource, StorageAdapter } from '@forge/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ensureProject } from '#/services/project-import.js';
import { makeTempDir } from '#tests/helpers/temp.js';

const YAML = `slug: demo
prefix: DM
profile: ts
commands:
  test: pnpm test
default_harness: claude-code
remote: git@example.com:demo.git
git_host:
  kind: local
  remote_path: ../demo-remote.git
`;

let storage: StorageAdapter;
let config: ConfigSource;
let path: string;
const log = (): void => undefined;

beforeEach(() => {
  storage = createMemoryStorage();
  config = createMemoryConfigSource();
  const dir = makeTempDir('forge-import-');
  path = join(dir, 'project.yaml');
  writeFileSync(path, YAML);
});

describe('ensureProject (bridge removed by B4)', () => {
  it('registers the project and saves its first settings version as "import"', async () => {
    const project = await ensureProject({
      storage,
      config,
      projectConfigPath: path,
      log,
    });

    expect(project).toMatchObject({
      slug: 'demo',
      prefix: 'DM',
      profile: 'ts',
      commands: { test: 'pnpm test' },
      git_host: { kind: 'local', base_branch: 'main' },
    });

    const rows = await storage.transaction((tx) => tx.projects.list());
    expect(rows).toEqual([
      expect.objectContaining({
        slug: 'demo',
        prefix: 'DM',
        repo_origin: 'git@example.com:demo.git',
      }),
    ]);

    const history = await config.history('project', 'demo');
    expect(history).toEqual([
      expect.objectContaining({
        version: 1,
        author: 'import',
        reason: 'initial import from project.yaml',
      }),
    ]);
  });

  it('never reads the file again and keeps what the settings page saved', async () => {
    await ensureProject({ storage, config, projectConfigPath: path, log });
    await config.append({
      scope: 'project',
      project: 'demo',
      // A version holds the whole override document, not a patch on the previous one.
      doc: { profile: 'ts', commands: { test: 'make check' } },
      author: 'owner',
      reason: 'switch runner',
      expectedVersion: 1,
    });

    rmSync(path);
    const project = await ensureProject({
      storage,
      config,
      projectConfigPath: path,
      log,
    });

    expect(project.commands).toEqual({ test: 'make check' });
    expect(project.profile).toBe('ts');
    expect((await config.history('project', 'demo')).map((v) => v.version)).toEqual([
      1, 2,
    ]);
  });

  it('fails naming the file when the database is empty and the file is missing', async () => {
    rmSync(path);

    await expect(
      ensureProject({ storage, config, projectConfigPath: path, log }),
    ).rejects.toThrow(/project config not found or unreadable/);
  });

  it('finishes an import that stopped after saving the settings', async () => {
    await config.append({
      scope: 'project',
      project: 'demo',
      doc: { profile: 'ts' },
      author: 'import',
      reason: 'initial import from project.yaml',
      expectedVersion: 0,
    });

    const project = await ensureProject({
      storage,
      config,
      projectConfigPath: path,
      log,
    });

    expect(project.slug).toBe('demo');
    expect(await storage.transaction((tx) => tx.projects.list())).toHaveLength(1);
    expect(await config.history('project', 'demo')).toHaveLength(1);
  });

  it('names the file and key when the content is invalid, and when it is not yaml', async () => {
    writeFileSync(path, 'slug: Bad Slug\nprefix: x\n');
    await expect(
      ensureProject({ storage, config, projectConfigPath: path, log }),
    ).rejects.toThrow(/project config is invalid.*slug/);

    writeFileSync(path, 'a: [unclosed');
    await expect(
      ensureProject({ storage, config, projectConfigPath: path, log }),
    ).rejects.toThrow(/not valid yaml/);
  });
});
