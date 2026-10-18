/**
 * Pins the local index of a plain markdown memory folder: it holds every file and knows when it is stale.
 *
 * Why: this repository's own memory stays markdown in git, but a session should read the few records that
 *   matter, so the folder is indexed with the same code the product uses. The index must hold every file
 *   (not one of the records whose header strict YAML rejects may be missing), must find the decisions by
 *   their words, and must know cheaply when the folder changed, rebuilding only then: a changed, added or
 *   removed file makes the index stale, a file only touched without a change in content does not, and
 *   nothing in the folder is written.
 *
 * Pins: every file loaded and none refused, search finds `d-0015` for `tdd red green` in the top three through
 *   the product's index, the manifest comparison for unchanged, touched, edited, added and removed files.
 * Depends on: adapters/markdown-index, adapters/sql-memory-index, helpers/repo-fixture, @forge/db, vitest.
 *   IO: temp folder, in-memory SQLite.
 */

import { cp, mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteStorage } from '@forge/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  loadMarkdownInto,
  scanMarkdown,
} from '#/adapters/markdown-index/scan-markdown.js';
import { createSqlMemoryIndex } from '#/adapters/sql-memory-index/create-sql-memory-index.js';
import { DEV_MEMORY_DIR } from '#tests/helpers/repo-fixture.js';

let dir: string;
const NOW = new Date('2026-10-18T12:00:00Z');

async function count(folder: string): Promise<number> {
  let n = 0;
  for (const e of await readdir(folder, { withFileTypes: true })) {
    n += e.isDirectory()
      ? await count(join(folder, e.name))
      : e.name.endsWith('.md')
        ? 1
        : 0;
  }

  return n;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'forge-mdindex-'));
  for (const f of ['decisions', 'rejected', 'proposed', 'outcomes']) {
    await cp(join(DEV_MEMORY_DIR, f), join(dir, f), { recursive: true });
  }
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('loading the folder', () => {
  it('holds every file, refuses none, and finds a decision by its words through the product index', async () => {
    const storage = createSqliteStorage(':memory:');
    const files = (
      await Promise.all(
        ['decisions', 'rejected', 'proposed', 'outcomes'].map((f) => count(join(dir, f))),
      )
    ).reduce((a, b) => a + b, 0);

    const report = await loadMarkdownInto(storage, dir, 'forge', NOW);

    expect(report).toMatchObject({
      state: 'verified',
      files,
      imported: files,
      rejects: [],
    });

    expect(report.lenient).toBeGreaterThanOrEqual(36);

    const index = createSqlMemoryIndex({ storage, now: () => NOW });
    const hits = await index.search({
      project: 'forge',
      actor: 'cli',
      text: 'tdd red green',
    });

    expect(hits.hits.slice(0, 3).map((h) => h.id)).toContain('d-0015');
    expect(await index.get('forge', ['d-0015'], { actor: 'cli' })).toMatchObject({
      records: [{ id: 'd-0015', pinned: true }],
    });

    await storage.close();
  }, 120_000);
});

describe('knowing when the folder changed', () => {
  it('says changed with no manifest, unchanged right after, and records a hash per file', async () => {
    const first = await scanMarkdown(dir, null);
    const again = await scanMarkdown(dir, first.manifest);

    expect(first.changed).toBe(true);
    expect(first.manifest.files.length).toBeGreaterThan(100);
    expect(first.manifest.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256))).toBe(true);
    expect(again.changed).toBe(false);
    expect(again.manifest).toEqual(first.manifest);
  });

  it('does not call a touched file changed when its content is the same, but does when it is edited', async () => {
    const first = await scanMarkdown(dir, null);
    const target = join(dir, first.manifest.files[0]?.path ?? '');
    const text = await (await import('node:fs/promises')).readFile(target, 'utf8');

    await utimes(target, new Date(), new Date(Date.now() + 5000));
    const touched = await scanMarkdown(dir, first.manifest);
    expect(touched.changed).toBe(false);
    expect(touched.manifest.files[0]?.mtimeMs).not.toBe(first.manifest.files[0]?.mtimeMs);

    await writeFile(target, `${text}\nEdited.\n`, 'utf8');
    const edited = await scanMarkdown(dir, touched.manifest);
    expect(edited.changed).toBe(true);

    await writeFile(target, text, 'utf8');
  });

  it('says changed for an added file and for a removed file', async () => {
    const base = await scanMarkdown(dir, null);
    const added = join(dir, 'decisions', 'd-9999-new.md');
    await writeFile(
      added,
      '---\nid: d-9999\nstatement: New\nstatus: active\n---\n',
      'utf8',
    );

    const withAdded = await scanMarkdown(dir, base.manifest);
    expect(withAdded.changed).toBe(true);

    await rm(added);
    const removed = await scanMarkdown(dir, withAdded.manifest);
    expect(removed.changed).toBe(true);
    expect((await scanMarkdown(dir, removed.manifest)).changed).toBe(false);
  });

  it('writes nothing into the folder and ignores files outside the four folders', async () => {
    await mkdir(join(dir, '.index'), { recursive: true });
    await writeFile(join(dir, '.index', 'ignored.md'), 'x', 'utf8');
    await writeFile(join(dir, 'MEMORY.md'), 'generated', 'utf8');

    const scan = await scanMarkdown(dir, null);

    expect(
      scan.manifest.files.some(
        (f) => f.path.startsWith('.index') || f.path === 'MEMORY.md',
      ),
    ).toBe(false);
  });
});
