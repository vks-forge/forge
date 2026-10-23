/**
 * Pins the local index of this repository's own memory: complete, shared with the product, rebuilt only when stale.
 *
 * Why: `forge memory search` is how a session reads a few relevant records instead of every file. The index has
 *   to hold every file of the real `.forge/memory` (not one of the records whose header strict YAML rejects may be
 *   missing), find `d-0015` for `tdd red green` in the top three, and give exactly the answers the product's
 *   own index gives (the search code is shared, not copied: a test builds the same records through the product's
 *   own `createSqlMemoryIndex` and compares). It must rebuild when a file changed, an added file or a deleted
 *   index, rebuild from nothing after damage because the markdown is the truth, reuse itself when nothing
 *   changed, and write nothing outside `.index/`.
 *
 * Pins: every file indexed with none refused, d-0015 in the top three, answers equal to the product index, a
 *   second open reuses, an edit and a new file rebuild, a deleted `.index/` and a corrupt database rebuild,
 *   a touch without a change reuses, and the folder outside `.index/` is untouched.
 * Depends on: src/services/memory-index-open, @forge/memory, @forge/db, vitest.
 *   IO: a temp copy of this repository's memory, SQLite files.
 */

import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSqliteStorage } from '@forge/db';
import { createSqlMemoryIndex, loadMarkdownInto } from '@forge/memory';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openLocalMemoryIndex } from '#/services/memory-index-open.js';

const DEV = fileURLToPath(new URL('../../../../.forge/memory', import.meta.url));
let dir: string;

async function files(root: string, skip = '.index'): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (d: string): Promise<void> => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== skip) {
          await walk(p);
        }
      } else {
        out[relative(root, p).replace(/\\/g, '/')] =
          `${(await stat(p)).size}:${(await readFile(p, 'utf8')).length}`;
      }
    }
  };

  await walk(root);

  return out;
}

const count = async (folder: string): Promise<number> => {
  let n = 0;
  for (const e of await readdir(folder, { withFileTypes: true })) {
    n += e.isDirectory()
      ? await count(join(folder, e.name))
      : e.name.endsWith('.md')
        ? 1
        : 0;
  }

  return n;
};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'forge-cli-mem-'));
  for (const f of ['decisions', 'rejected', 'proposed', 'outcomes']) {
    await cp(join(DEV, f), join(dir, f), { recursive: true });
  }
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const ids = (r: { hits: { id: string }[] }): string[] => r.hits.map((h) => h.id);
const ask = async (text: string) => {
  const opened = await openLocalMemoryIndex(dir);
  try {
    return {
      reply: await opened.index.search({ project: 'forge', actor: 'cli', text }),
      rebuilt: opened.rebuilt,
    };
  } finally {
    await opened.close();
  }
};

const countRetiredRejected = async (folder: string): Promise<number> => {
  let n = 0;
  for (const e of await readdir(folder)) {
    if (
      e.endsWith('.md') &&
      /^status:\s*superseded\s*$/m.test(await readFile(join(folder, e), 'utf8'))
    ) {
      n += 1;
    }
  }

  return n;
};

describe('the local index', () => {
  it('holds every file, none refused, and finds the TDD decision in the top three', async () => {
    const before = await files(dir);
    const opened = await openLocalMemoryIndex(dir);
    const everything = (
      await Promise.all(
        ['decisions', 'rejected', 'proposed', 'outcomes'].map((f) => count(join(dir, f))),
      )
    ).reduce((a, b) => a + b, 0);

    const list = await opened.index.list('forge');
    const hits = await opened.index.search({
      project: 'forge',
      actor: 'cli',
      text: 'tdd red green',
    });

    const view = (await opened.index.get('forge', ['d-0015'], { actor: 'cli' }))
      .records[0];

    const related = await opened.index.related('forge', 'd-0015', 5, { actor: 'cli' });
    const nothing = await opened.index.search({
      project: 'forge',
      actor: 'cli',
      text: 'zzzquokkazzz',
    });

    await opened.close();

    expect(opened.rebuilt).toBe(true);
    // The list is every record but outcomes; scopeAdmits hides a rejected approach whose file says
    // superseded (it is no longer in force), so those are subtracted too.
    const retired = await countRetiredRejected(join(dir, 'rejected'));

    expect(list.length).toBe(everything - (await count(join(dir, 'outcomes'))) - retired);
    expect(ids(hits).slice(0, 3)).toContain('d-0015');
    expect(view).toMatchObject({ id: 'd-0015', kind: 'decision', pinned: true });
    expect(related).not.toBeNull();
    expect(nothing).toEqual({ hits: [], total: 0, truncated: false });
    expect(await files(dir)).toEqual(before);
  }, 120_000);

  it('gives the same answers as the product index built from the same folder', async () => {
    const storage = createSqliteStorage(':memory:');
    await loadMarkdownInto(storage, dir, 'forge', new Date());
    const product = createSqlMemoryIndex({ storage, now: () => new Date() });
    const opened = await openLocalMemoryIndex(dir);

    for (const text of [
      'tdd red green',
      'sqlite wal',
      'worker memory slice',
      'rejected approaches always listed',
    ]) {
      const mine = await opened.index.search({ project: 'forge', actor: 'cli', text });
      const theirs = await product.search({ project: 'forge', actor: 'cli', text });

      expect(ids(mine)).toEqual(ids(theirs));
      expect(mine.total).toBe(theirs.total);
    }

    await opened.close();
    await storage.close();
  }, 120_000);

  it('reuses itself when nothing changed, even when a file was only touched', async () => {
    expect((await ask('tdd')).rebuilt).toBe(false);

    const target = join(
      dir,
      'decisions',
      (await readdir(join(dir, 'decisions')))[0] ?? '',
    );

    await utimes(target, new Date(), new Date(Date.now() + 10_000));

    expect((await ask('tdd')).rebuilt).toBe(false);
  }, 120_000);

  it('rebuilds when a file is edited, and the edit is searchable', async () => {
    const target = join(dir, 'decisions', 'd-9001-quokka.md');
    await writeFile(
      target,
      '---\nid: d-9001\nstatement: Quokka telescope calibration\nstatus: active\n---\nBody.\n',
      'utf8',
    );

    const first = await ask('quokka telescope');
    expect(first.rebuilt).toBe(true);
    expect(ids(first.reply)).toContain('d-9001');

    await writeFile(
      target,
      '---\nid: d-9001\nstatement: Quokka telescope calibration moved\nstatus: active\n---\nBody.\n',
      'utf8',
    );

    const second = await ask('quokka telescope moved');
    expect(second.rebuilt).toBe(true);
    expect(second.reply.hits.find((h) => h.id === 'd-9001')?.line).toContain('moved');

    await rm(target);
    expect((await ask('quokka telescope')).rebuilt).toBe(true);
    expect(ids((await ask('quokka telescope')).reply)).not.toContain('d-9001');
  }, 120_000);

  it('rebuilds from nothing after the index folder is deleted or the database is damaged', async () => {
    await rm(join(dir, '.index'), { recursive: true, force: true });
    const fresh = await ask('tdd red green');
    expect(fresh.rebuilt).toBe(true);
    expect(ids(fresh.reply).slice(0, 3)).toContain('d-0015');

    await writeFile(
      join(dir, '.index', 'memory.sqlite'),
      'this is not a database'.repeat(300),
      'utf8',
    );

    await rm(join(dir, '.index', 'memory.sqlite-wal'), { force: true });
    await rm(join(dir, '.index', 'memory.sqlite-shm'), { force: true });

    const repaired = await ask('tdd red green');
    expect(repaired.rebuilt).toBe(true);
    expect(ids(repaired.reply).slice(0, 3)).toContain('d-0015');
  }, 120_000);

  it('keeps its files in .index and nothing else changes in the folder', async () => {
    const before = await files(dir);
    await ask('tdd');

    expect(await files(dir)).toEqual(before);
    expect((await readdir(join(dir, '.index'))).some((f) => f === 'files.json')).toBe(
      true,
    );
  }, 120_000);
});
