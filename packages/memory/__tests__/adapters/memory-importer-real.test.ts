/**
 * Pins the importer against a copy of this project's own memory records.
 *
 * Why: the importer exists because this repository's own `.forge/memory` is the messiest real input there is:
 *   a fifth of the headers fail strict YAML, approved proposals carry the old kind word `proposed`, outcome
 *   notes have no id and some have no header at all. If any record were dropped on the way, a decision the
 *   owner made would stop constraining the Director. The test copies the real files into a temp repository,
 *   imports them into the SQL storage and checks that every file is a record, no file is refused, every
 *   statement is byte-equal to the line in its file, the copy verifies, and a second run adds nothing.
 *
 * Pins: every file (decisions, rejected approaches, proposals, outcomes, counted from the folders) becomes a
 *   record and none is refused, statements of the strict-failing records equal their raw lines, fields that parse survive
 *   (pinned, tags, supersedes link, author, origin), the copy verifies and the repository is then removed,
 *   a second import inserts nothing twice, and the index finds a decision by its words.
 * Depends on: adapters/memory-importer/create-importer, helpers/repo-fixture, @forge/db, @forge/core, vitest.
 *   IO: temp folders, `git`, in-memory SQLite.
 */

import { readFile, readdir, rm, stat } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMatch, directorScope } from '@forge/core';
import type { StorageAdapter } from '@forge/core';
import { createSqliteStorage } from '@forge/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMemoryImporter } from '#/adapters/memory-importer/create-importer.js';
import { DEV_MEMORY_DIR, copyDevMemory } from '#tests/helpers/repo-fixture.js';

let root: string;
let storage: StorageAdapter;
/** The dev records change every session, so the expected counts are read from the files, not written down. */
const expected = { decision: 0, rejected: 0, proposal: 0, outcome: 0, files: 0 };

async function countMarkdown(dir: string): Promise<number> {
  let n = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    n += entry.isDirectory()
      ? await countMarkdown(join(dir, entry.name))
      : entry.name.endsWith('.md')
        ? 1
        : 0;
  }

  return n;
}

const importer = () =>
  createMemoryImporter({
    storage,
    rootDir: root,
    now: () => new Date('2026-10-18T12:00:00Z'),
  });

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'forge-import-real-'));
  storage = createSqliteStorage(':memory:');
  await copyDevMemory(root, 'forge');
  expected.decision = await countMarkdown(join(DEV_MEMORY_DIR, 'decisions'));
  expected.rejected = await countMarkdown(join(DEV_MEMORY_DIR, 'rejected'));
  expected.proposal = await countMarkdown(join(DEV_MEMORY_DIR, 'proposed'));
  expected.outcome = await countMarkdown(join(DEV_MEMORY_DIR, 'outcomes'));
  expected.files =
    expected.decision + expected.rejected + expected.proposal + expected.outcome;
}, 120_000);

afterAll(async () => {
  await storage.close();
  await rm(root, { recursive: true, force: true });
});

const rowsOf = () => storage.transaction((tx) => tx.memory.list('forge'));

describe('importing this repository own memory', () => {
  it('turns every file into a record and refuses none', async () => {
    const status = await importer().import('forge', '/backups/x');

    expect(status.rejects).toEqual([]);
    expect(status).toMatchObject({
      state: 'verified',
      files: expected.files,
      imported: expected.files,
      backup_path: '/backups/x',
    });

    expect(status.lenient).toBeGreaterThanOrEqual(36);

    const counts = await storage.transaction((tx) => tx.memory.counts('forge'));
    const byKind = (kind: string): number =>
      counts.filter((c) => c.kind === kind).reduce((n, c) => n + c.count, 0);

    expect(byKind('decision')).toBe(expected.decision);
    expect(byKind('rejected')).toBe(expected.rejected);
    expect(byKind('proposal')).toBe(expected.proposal);
    expect(byKind('outcome')).toBe(expected.outcome);
  }, 120_000);

  it('keeps the statement of every record byte for byte as written on its line', async () => {
    const rows = await rowsOf();
    let strictFailing = 0;
    for (const row of rows.filter((r) => r.kind !== 'outcome')) {
      const path = (row.imported_from ?? '').split('@')[0] ?? '';
      const text = (
        await readFile(join(DEV_MEMORY_DIR, ...path.split('/')), 'utf8')
      ).replace(/\r\n/g, '\n');

      const header = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
      const line = /^statement:[ \t]+(.*)$/m.exec(header)?.[1]?.trim() ?? '';
      if (row.raw_front_matter !== null && line !== '' && !/^["'|>]/.test(line)) {
        strictFailing += 1;
        expect(row.statement, row.id).toBe(line);
      }
    }

    expect(strictFailing).toBeGreaterThanOrEqual(34);
  });

  it('keeps the fields that parse on records whose header strict YAML rejects', async () => {
    const d19 = await storage.transaction((tx) => tx.memory.get('forge', 'd-0019'));
    const tags = await storage.transaction((tx) => tx.memory.tagsOf('forge', ['d-0019']));
    const links = await storage.transaction((tx) => tx.memory.linksOf('forge', 'd-0019'));
    const d140 = await storage.transaction((tx) => tx.memory.get('forge', 'd-0140'));

    expect(d19).toMatchObject({
      kind: 'decision',
      status: 'active',
      author: 'user',
      origin: 'owner',
      pinned: true,
    });

    expect(d19?.raw_front_matter).toContain('statement:');
    expect(d19?.lenient_fields).toContain('statement');
    expect(tags['d-0019']?.length).toBeGreaterThan(0);
    expect(
      links.out.some((l) => l.rel === 'supersedes') || d19?.superseded_by === null,
    ).toBe(true);

    expect(d140).toMatchObject({
      source_type: 'imported',
      author: 'user',
      origin: 'owner',
    });

    expect(d140?.source_ref).toContain('enhance-decisions');
  });

  it('keeps rejected approaches in force, approved proposals as decisions and outcomes with ids', async () => {
    const rejected = await storage.transaction((tx) =>
      tx.memory.list('forge', { kinds: ['rejected'] }),
    );

    const approved = await storage.transaction((tx) => tx.memory.get('forge', 'x-0007'));
    const outcomes = await storage.transaction((tx) =>
      tx.memory.list('forge', { kinds: ['outcome'] }),
    );

    // A rejected approach stays 'rejected' unless its own file says it was superseded (r-0005 by d-0183).
    const fileStatus = async (id: string): Promise<string> => {
      const name = (await readdir(join(DEV_MEMORY_DIR, 'rejected'))).find((f) =>
        f.startsWith(`${id}-`),
      );

      const text = await readFile(join(DEV_MEMORY_DIR, 'rejected', name ?? ''), 'utf8');

      return /^status:\s*superseded\s*$/m.test(text) ? 'superseded' : 'rejected';
    };

    expect(rejected).toHaveLength(expected.rejected);
    expect(Object.fromEntries(rejected.map((r) => [r.id, r.status]))).toEqual(
      Object.fromEntries(
        await Promise.all(rejected.map(async (r) => [r.id, await fileStatus(r.id)])),
      ),
    );

    expect(approved).toMatchObject({ kind: 'decision' });
    expect(outcomes.map((o) => o.id)).toEqual(
      Array.from(
        { length: expected.outcome },
        (_, i) => `o-${String(i + 1).padStart(4, '0')}`,
      ),
    );

    expect(outcomes.every((o) => o.statement.length > 0 && o.origin === 'system')).toBe(
      true,
    );
  });

  it('finds a decision by its words through the search index', async () => {
    const hits = await storage.transaction((tx) =>
      tx.memory.searchLexical({
        project: 'forge',
        match: buildMatch({ terms: ['tdd'], mode: 'and' }) as string,
        scope: directorScope(),
        limit: 5,
        snippet: false,
      }),
    );

    expect(hits.map((h) => h.id)).toContain('d-0015');
  });

  it('inserts nothing twice on a second run and still verifies', async () => {
    const before = (await rowsOf()).length;
    const events = await storage.transaction((tx) =>
      tx.memory.history('forge', 'd-0015'),
    );

    const again = await importer().import('forge', null);
    const after = await storage.transaction((tx) => tx.memory.history('forge', 'd-0015'));

    expect(again).toMatchObject({
      state: 'verified',
      files: expected.files,
      imported: expected.files,
    });

    expect((await rowsOf()).length).toBe(before);
    expect(after.events).toEqual(events.events);
  }, 120_000);

  it('removes the old repository only after the proof, and records when', async () => {
    expect(await importer().deleteRepo('forge')).toBe(true);

    await expect(stat(join(root, 'forge'))).rejects.toThrow();
    expect(await readdir(root)).not.toContain('forge');
    const state = await storage.transaction((tx) => tx.memory.importState('forge'));
    expect(state?.repo_deleted_at).toBe('2026-10-18T12:00:00.000Z');
    expect(await importer().deleteRepo('forge')).toBe(false);
  }, 120_000);
});
