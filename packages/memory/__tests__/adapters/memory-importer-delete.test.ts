/**
 * Pins when the importer may delete the old repository, and how it treats unusual repositories.
 *
 * Why: the old per-project repository is removed after the import, so every way the copy can be stale or the
 *   folder can be wrong must stop that: a commit that lands after the proof, uncommitted work, a folder that is
 *   not a repository and a slug that could leave the memory folder all refuse; a crash between the import and
 *   the deletion leaves both, and the next start proves the copy again and finishes. Odd repositories (empty,
 *   not a repository at all, hand-written outcomes without ids) must be reported or numbered, not crash.
 *
 * Pins: delete after a verified import and never twice, abort on a late commit, on uncommitted work, on a
 *   folder that is not a repository and on a slug that could escape; a restart re-verifies and deletes; no
 *   database work once the folder is gone; an empty repository, a missing repository (reported as failed) and
 *   outcomes numbered after the highest `o-` id in path order.
 * Depends on: adapters/memory-importer/create-importer, helpers/import-fixtures, helpers/repo-fixture, @forge/db,
 *   vitest. IO: temp folders and `git`.
 */

import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StorageAdapter } from '@forge/core';
import { createMemoryStorage } from '@forge/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryImporter } from '#/adapters/memory-importer/create-importer.js';
import { decision, forty } from '#tests/helpers/import-fixtures.js';
import { commitAll, makeRepo } from '#tests/helpers/repo-fixture.js';

let root: string;
let storage: StorageAdapter;
const importer = () =>
  createMemoryImporter({
    storage,
    rootDir: root,
    now: () => new Date('2026-10-18T12:00:00Z'),
  });

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'forge-import-'));
  storage = createMemoryStorage();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('deleting', () => {
  it('removes the folder after a verified import and refuses a second time', async () => {
    await makeRepo(root, 'shop', forty());
    await importer().import('shop', '/b');

    expect(await importer().deleteRepo('shop')).toBe(true);
    await expect(stat(join(root, 'shop'))).rejects.toThrow();
    expect(await importer().deleteRepo('shop')).toBe(false);
  });

  it('aborts when a commit lands between the proof and the delete', async () => {
    const dir = await makeRepo(root, 'shop', forty());
    await importer().import('shop', null);

    await writeFile(
      join(dir, 'decisions', 'late.md'),
      decision(99, 'Landed late')[1],
      'utf8',
    );

    await commitAll(dir, 'late');

    expect(await importer().deleteRepo('shop')).toBe(false);
    await expect(stat(join(dir, 'decisions', 'late.md'))).resolves.toBeDefined();
  });

  it('refuses a folder with uncommitted work', async () => {
    const dir = await makeRepo(root, 'shop', forty());
    await importer().import('shop', null);
    await writeFile(join(dir, 'decisions', 'draft.md'), 'not committed', 'utf8');

    expect(await importer().deleteRepo('shop')).toBe(false);
    await expect(stat(join(dir, 'decisions', 'draft.md'))).resolves.toBeDefined();
  });

  it('refuses a folder that is not a repository and a slug that could leave the memory folder', async () => {
    await makeRepo(root, 'shop', forty());
    await importer().import('shop', null);
    await rm(join(root, 'shop', '.git'), { recursive: true, force: true });

    expect(await importer().deleteRepo('shop')).toBe(false);
    await expect(stat(join(root, 'shop', 'decisions'))).resolves.toBeDefined();
    expect(await importer().deleteRepo('../shop')).toBe(false);
    expect(await importer().deleteRepo('Shop/../x')).toBe(false);
  });

  it('leaves both after a crash between import and delete, and the next start proves the copy again and deletes', async () => {
    await makeRepo(root, 'shop', forty());
    await importer().import('shop', null);

    // The process dies here: a new importer with the same database starts over.
    const restarted = importer();
    const status = await restarted.verify('shop');

    expect(status.state).toBe('verified');
    await expect(stat(join(root, 'shop', '.git'))).resolves.toBeDefined();
    expect(await restarted.deleteRepo('shop')).toBe(true);
    await expect(stat(join(root, 'shop'))).rejects.toThrow();
  });

  it('does not touch the database again once the folder is gone', async () => {
    await makeRepo(root, 'shop', forty());
    await importer().import('shop', null);
    await importer().deleteRepo('shop');

    const status = await importer().verify('shop');

    expect(status).toMatchObject({ state: 'verified' });
    expect(status.repo_deleted_at).not.toBeNull();
  });
});

describe('edge repositories', () => {
  it('verifies an empty repository with no files and deletes it', async () => {
    await makeRepo(root, 'empty', {});

    const status = await importer().import('empty', null);

    expect(status).toMatchObject({
      state: 'verified',
      files: 0,
      imported: 0,
      head_sha: null,
    });

    expect(await importer().deleteRepo('empty')).toBe(true);
  });

  it('reports failed, not thrown, when the project has no repository to read', async () => {
    await mkdir(join(root, 'ghost'), { recursive: true });

    const status = await importer().import('ghost', null);

    expect(status.state).toBe('failed');
    expect(status.message).not.toBeNull();
  });

  it('numbers hand-written outcomes without ids in path order after the highest o- id', async () => {
    await makeRepo(root, 'shop', {
      'outcomes/2026-10/2026-10-12-b.md': '# Second note\n\nBody.\n',
      'outcomes/2026-10/2026-10-11-a.md': '# First note\n\nBody.\n',
      'outcomes/2026-10/o-0007.md':
        '---\nid: o-0007\nkind: outcome\nstatement: Writer made\nstatus: active\nauthor: director\norigin: system\nvalid_from: 2026-10-15\nsource: { type: system, ref: director outcome }\n---\nText\n',
    });

    await importer().import('shop', null);
    const rows = await storage.transaction((tx) =>
      tx.memory.list('shop', { kinds: ['outcome'] }),
    );

    expect(rows.map((r) => [r.id, r.statement])).toEqual([
      ['o-0007', 'Writer made'],
      ['o-0008', 'First note'],
      ['o-0009', 'Second note'],
    ]);
  });
});
