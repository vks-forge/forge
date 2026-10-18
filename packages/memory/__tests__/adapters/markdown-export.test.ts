/**
 * Pins the markdown export of project memory: layout, exactness, repeatability and the line budget.
 *
 * Why: the owner reads, diffs and reviews memory as plain files, and the repository mirror (d-0086) will read
 *   this folder, so the export must be exact and repeatable. Every record becomes one file in the old layout
 *   with the header the writer always used, so the existing codec parses it back to the record it came from;
 *   two exports of an unchanged memory are byte-identical (nothing in a file depends on the clock); the
 *   generated index stays inside its 200 lines however long memory grows; and nothing is written outside the
 *   folder it is given. The real test imports this project's own memory and exports it twice.
 *
 * Pins: layout and file names by kind, header fields (links, aids, stamps), a superseded record, outcomes by
 *   month, index sections, an export that parses back equal to the rows, a second export byte-identical,
 *   `MEMORY.md` at most 200 lines, and files only under the target folder.
 * Depends on: adapters/markdown-export, adapters/sql-project-memory, adapters/memory-importer, domain/record-file,
 *   helpers/repo-fixture, @forge/db, vitest. IO: temp folders, `git`, in-memory SQLite.
 */

import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StorageAdapter } from '@forge/core';
import { createSqliteStorage } from '@forge/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryImporter } from '#/adapters/memory-importer/create-importer.js';
import { createMarkdownExporter } from '#/adapters/markdown-export/export-project.js';
import { createSqlProjectMemory } from '#/adapters/sql-project-memory/create-sql-project-memory.js';
import { parseRecordFile } from '#/domain/record-file.js';
import { copyDevMemory } from '#tests/helpers/repo-fixture.js';

let root: string;
let storage: StorageAdapter;
const NOW = new Date('2026-10-18T12:00:00Z');
const source = { type: 'chat', ref: 'the owner' } as const;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'forge-export-'));
  storage = createSqliteStorage(':memory:');
});

afterEach(async () => {
  await storage.close();
  await rm(root, { recursive: true, force: true });
});

const exporter = () => createMarkdownExporter({ storage, now: () => NOW });

async function tree(dir: string, base = dir): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(out, await tree(path, base));
    } else {
      out[path.slice(base.length + 1).replace(/\\/g, '/')] = await readFile(path, 'utf8');
    }
  }

  return out;
}

describe('a small memory', () => {
  beforeEach(async () => {
    let ms = Date.parse('2026-10-15T10:00:00Z');
    const memory = createSqlProjectMemory({ storage, now: () => new Date((ms += 1000)) });
    await memory.writer.decide('shop', {
      statement: 'Use REST: simple',
      source,
      tags: ['api'],
    });

    await memory.writer.supersede('shop', 'd-0001', {
      statement: 'Use GraphQL',
      source,
      gist: 'graphql now',
      aliases: ['gql'],
      links: { amends: ['d-0001'], card: 'FG-C1' },
    });

    const p = await memory.writer.propose('shop', {
      statement: 'Adopt mongo',
      source,
      confidence: 0.5,
    });

    await memory.writer.reject('shop', p.id, 'we use SQLite', 'vikash');
    await memory.writer.propose('shop', { statement: 'Pending idea', source });
    await memory.writer.appendOutcome('shop', 'Shipped login.\n\nPending: logout.');
  });

  it('writes one file per record in the old layout, plus the index', async () => {
    const files = await exporter().render('shop');

    expect(files.map((f) => f.relPath)).toEqual([
      'MEMORY.md',
      'decisions/d-0001-use-rest-simple.md',
      'decisions/d-0002-use-graphql.md',
      'outcomes/2026-10/o-0001-shipped-login.md',
      'proposed/x-0002-pending-idea.md',
      'rejected/x-0001-adopt-mongo.md',
    ]);
  });

  it('writes each header with the codec, so it parses back to the record, links and aids included', async () => {
    const files = await exporter().render('shop');
    const read = (path: string) =>
      parseRecordFile(files.find((f) => f.relPath === path)?.text ?? '');

    const old = read('decisions/d-0001-use-rest-simple.md');
    const next = read('decisions/d-0002-use-graphql.md');
    const rejected = read('rejected/x-0001-adopt-mongo.md');
    const outcome = read('outcomes/2026-10/o-0001-shipped-login.md');

    expect(old.ok && old.record).toMatchObject({
      status: 'superseded',
      superseded_by: 'd-0002',
      author: 'user',
      statement: 'Use REST: simple',
      tags: ['api'],
    });

    expect(next.ok && next.record).toMatchObject({
      supersedes: 'd-0001',
      gist: 'graphql now',
      aliases: ['gql'],
      amends: ['d-0001'],
      card: 'FG-C1',
      pinned: true,
    });

    expect(rejected.ok && rejected.record).toMatchObject({
      kind: 'rejected',
      rejected_reason: 'we use SQLite',
      rejected_by: 'vikash',
      confidence: 0.5,
    });

    expect(outcome.ok && outcome.body).toBe('Shipped login.\n\nPending: logout.');
  });

  it('lists what is in force in the index and counts what is not', async () => {
    const index =
      (await exporter().render('shop')).find((f) => f.relPath === 'MEMORY.md')?.text ??
      '';

    expect(index).toContain('# Memory of shop');
    expect(index).toContain(
      '## Decisions\n- [d-0002](decisions/d-0002-use-graphql.md): Use GraphQL',
    );

    expect(index).toContain(
      '## Rejected approaches\n- [x-0001](rejected/x-0001-adopt-mongo.md): Adopt mongo',
    );

    expect(index).toContain(
      '## Pending proposals\n- [x-0002](proposed/x-0002-pending-idea.md): Pending idea',
    );

    expect(index).toContain('1 superseded decision(s)');
    expect(index).not.toContain('d-0001](');
  });

  it('writes only under the folder it is given and says what it wrote', async () => {
    const dir = join(root, 'out', 'memory-shop-1');
    const reply = await exporter().exportTo('shop', dir);

    expect(reply).toEqual({ path: dir, files: 6, at: '2026-10-18T12:00:00.000Z' });
    expect(Object.keys(await tree(dir))).toHaveLength(6);
    expect((await readdir(root)).sort()).toEqual(['out']);
  });

  it('exports nothing for a project with no memory except an empty index', async () => {
    const files = await exporter().render('nobody');

    expect(files.map((f) => f.relPath)).toEqual(['MEMORY.md']);
  });
});

describe('this repository own memory, imported and exported twice', () => {
  it('parses back equal to the database, is byte-identical on a second run and keeps the index short', async () => {
    await copyDevMemory(root, 'forge');
    await mkdir(join(root, 'exports'), { recursive: true });
    const status = await createMemoryImporter({
      storage,
      rootDir: root,
      now: () => NOW,
    }).import('forge', null);

    expect(status.state).toBe('verified');

    const a = join(root, 'exports', 'a');
    const b = join(root, 'exports', 'b');
    await exporter().exportTo('forge', a);
    await exporter().exportTo('forge', b);
    const first = await tree(a);
    const second = await tree(b);

    expect(second).toEqual(first);
    expect(first['MEMORY.md']?.split('\n').length).toBeLessThanOrEqual(201);

    const rows = await storage.transaction((tx) => tx.memory.list('forge'));
    expect(Object.keys(first)).toHaveLength(rows.length + 1);

    for (const row of rows) {
      const file = Object.entries(first).find(
        ([path]) => path.includes(`/${row.id}-`) || path.endsWith(`/${row.id}.md`),
      );

      const parsed = parseRecordFile(file?.[1] ?? '');

      expect(parsed.ok, row.id).toBe(true);
      if (parsed.ok) {
        expect(parsed.record).toMatchObject({
          id: row.id,
          kind: row.kind,
          status: row.status,
          statement: row.statement,
          author: row.author,
          origin: row.origin,
          pinned: row.pinned,
        });

        expect(parsed.body).toBe(row.body.trim());
      }
    }
  }, 180_000);
});
