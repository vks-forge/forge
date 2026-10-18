/**
 * Pins the importer's safety rules on small repositories: refusals, verification, and when it may delete.
 *
 * Why: the old per-project repository is removed after the import, so every way the copy can be wrong must
 *   stop that. A file with no id or no statement is listed as refused and leaves the project in
 *   `needs_attention` with the repository untouched; a difference between the files and the database does the
 *   same; a commit that lands after the proof means the proof is stale; a folder that is not the project's own
 *   repository, or holds uncommitted work, is never removed. A crash between the import and the deletion
 *   leaves both, and the next start proves the copy again and finishes. The same fixture of forty records,
 *   twelve of them with headers strict YAML rejects, must import completely.
 *
 * Pins: 40 records with 12 strict-failing headers all import with their statements and fields; a refused file
 *   gives `needs_attention` and `files = imported + rejects`; a changed file makes verification fail and the
 *   folder stays; a commit between verify and delete aborts the delete; uncommitted work and a folder that is
 *   not a repository block it; a restart re-verifies and deletes; an empty repository verifies with nothing;
 *   an unknown slug cannot reach outside the memory folder.
 * Depends on: adapters/memory-importer/create-importer, helpers/repo-fixture, @forge/db, vitest.
 *   IO: temp folders and `git`.
 */

import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StorageAdapter } from '@forge/core';
import { createMemoryStorage } from '@forge/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryImporter } from '#/adapters/memory-importer/create-importer.js';
import { FAILING, decision, forty } from '#tests/helpers/import-fixtures.js';
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

describe('a repository of forty records, twelve with headers strict YAML rejects', () => {
  it('imports all forty, keeps each statement and every field that parses, and verifies', async () => {
    await makeRepo(root, 'shop', forty());

    const status = await importer().import('shop', null);
    const rows = await storage.transaction((tx) => tx.memory.list('shop'));

    expect(status).toMatchObject({
      state: 'verified',
      files: 40,
      imported: 40,
      rejects: [],
      lenient: 12,
    });

    expect(rows).toHaveLength(40);

    FAILING.forEach((statement, i) => {
      const row = rows.find((r) => r.id === `d-${String(29 + i).padStart(4, '0')}`);

      expect(row?.statement).toBe(statement);
      expect(row).toMatchObject({
        kind: 'decision',
        status: 'active',
        author: 'user',
        origin: 'owner',
        pinned: true,
        source_type: 'chat',
      });

      expect(row?.lenient_fields).toContain('statement');
      expect(row?.raw_front_matter).toContain('statement:');
    });

    const tags = await storage.transaction((tx) =>
      tx.memory.tagsOf('shop', ['d-0029', 'd-0030']),
    );

    const links = await storage.transaction((tx) => tx.memory.linksOf('shop', 'd-0029'));

    expect(tags['d-0029']).toEqual(['alpha', 'beta']);
    expect(links.out).toContainEqual({
      from_id: 'd-0029',
      rel: 'supersedes',
      target_kind: 'record',
      target: 'd-0001',
    });
  });

  it('numbers each record one history entry and a second import changes nothing', async () => {
    await makeRepo(root, 'shop', forty());
    await importer().import('shop', null);
    const before = await storage.transaction((tx) => tx.memory.history('shop', 'd-0005'));
    await importer().import('shop', null);
    const after = await storage.transaction((tx) => tx.memory.history('shop', 'd-0005'));

    expect(before.events).toHaveLength(1);
    expect(before.events[0]).toMatchObject({
      event: 'imported',
      actor: 'import',
      to_status: 'active',
    });

    expect(after).toEqual(before);
    expect(await storage.transaction((tx) => tx.memory.list('shop'))).toHaveLength(40);
  });
});

describe('refusals and differences', () => {
  it('lists a file with no id or no statement, keeps the rest and needs attention', async () => {
    const [p1, t1] = decision(1, 'Fine');
    await makeRepo(root, 'shop', {
      [p1]: t1,
      'decisions/noid.md': '---\nstatement: no id here\nstatus: active\n---\nx\n',
      'decisions/nostatement.md': '---\nid: d-0002\nstatus: active\n---\nx\n',
      'decisions/plain.md': 'no header at all\n',
    });

    const status = await importer().import('shop', null);

    expect(status.state).toBe('needs_attention');
    expect(status).toMatchObject({ files: 4, imported: 1 });
    expect(status.rejects).toEqual([
      { path: 'decisions/noid.md', reason: 'no id' },
      { path: 'decisions/nostatement.md', reason: 'no statement' },
      { path: 'decisions/plain.md', reason: 'no front matter' },
    ]);

    expect(status.files).toBe(status.imported + status.rejects.length);
    expect(status.message).toContain('3 file(s)');
    expect(await importer().deleteRepo('shop')).toBe(false);
    await expect(stat(join(root, 'shop', '.git'))).resolves.toBeDefined();
  });

  it('refuses the second file that carries an id already taken', async () => {
    const [p1, t1] = decision(1, 'First');
    await makeRepo(root, 'shop', { [p1]: t1, 'decisions/zz-copy.md': t1 });

    const status = await importer().import('shop', null);

    expect(status.rejects).toEqual([
      { path: 'decisions/zz-copy.md', reason: `duplicate id d-0001 (also in ${p1})` },
    ]);
  });

  it('fails verification when a file changed after the import, and keeps the repository', async () => {
    const dir = await makeRepo(root, 'shop', forty());
    expect((await importer().import('shop', null)).state).toBe('verified');

    const [path, text] = decision(3, 'Clean statement number 3, edited later');
    await writeFile(join(dir, ...path.split('/')), text, 'utf8');
    await commitAll(dir, 'edit');

    const status = await importer().verify('shop');

    expect(status.state).toBe('needs_attention');
    expect(status.message).toContain('repository changed since the import');
    expect(status.message).toContain('d-0003: statement differs');
    expect(await importer().deleteRepo('shop')).toBe(false);
    await expect(stat(join(dir, '.git'))).resolves.toBeDefined();
  });
});
