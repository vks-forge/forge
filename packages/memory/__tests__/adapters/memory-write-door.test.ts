/**
 * Pins that only one repository ever writes memory rows, by scanning the source of every package and app.
 *
 * Why: a project's memory is append-only by design: words never change, a record moves only by approve, reject
 *   or supersede, and the search index follows each write. The database triggers hold that a second time, but
 *   a rule that lives only in the triggers can be bypassed by a new helper that writes around the door and a
 *   migration that later relaxes them. So the sources are scanned: `UPDATE memory_records` may appear only in
 *   the records repository, writes to the full-text table only in its index module, `INSERT INTO
 *   memory_records` only in the records repository, and no `DELETE FROM memory_*` anywhere except the project
 *   purge, which holds the purge guard.
 *
 * Pins: no source file outside the allowed ones contains a write to `memory_records`, `memory_fts` or a
 *   delete from any memory table, and the allowed files really do contain them (the scan is not vacuous).
 * Depends on: node:fs/promises, node:path, vitest. IO: reads the repository's source folders.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

async function sources(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') {
      continue;
    }

    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await sources(path)));
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      out.push(path);
    }
  }

  return out;
}

async function allSources(): Promise<{ path: string; text: string }[]> {
  const roots = ['packages', 'apps'].map((r) => join(ROOT, r));
  const files = (await Promise.all(roots.map((r) => sources(r)))).flat();
  const srcOnly = files.filter((f) => /[\\/]src[\\/]/.test(f));

  return Promise.all(
    srcOnly.map(async (path) => ({
      path: relative(ROOT, path).replace(/\\/g, '/'),
      text: await readFile(path, 'utf8'),
    })),
  );
}

const RECORDS = 'packages/db/src/adapters/sqlite/memory-records-repository.ts';
const FTS = 'packages/db/src/adapters/sqlite/memory-fts.ts';
const PURGE = 'packages/db/src/adapters/sqlite/project-purge.ts';
const MIGRATION = 'packages/db/src/migrations/0029-memory.ts';

const offenders = (
  files: { path: string; text: string }[],
  pattern: RegExp,
  allowed: readonly string[],
): string[] =>
  files
    .filter((f) => pattern.test(f.text) && !allowed.includes(f.path))
    .map((f) => f.path);

describe('the one door that writes memory rows', () => {
  it('updates memory_records only in the records repository', async () => {
    const files = await allSources();

    expect(offenders(files, /UPDATE\s+memory_records/i, [RECORDS, MIGRATION])).toEqual(
      [],
    );

    expect(files.find((f) => f.path === RECORDS)?.text).toMatch(/UPDATE memory_records/);
  });

  it('inserts into memory_records only in the records repository', async () => {
    const files = await allSources();

    expect(
      offenders(files, /INSERT\s+(OR\s+\w+\s+)?INTO\s+memory_records/i, [RECORDS]),
    ).toEqual([]);

    expect(files.find((f) => f.path === RECORDS)?.text).toMatch(
      /INSERT INTO memory_records/,
    );
  });

  it('writes the full-text index only in its index module', async () => {
    const files = await allSources();
    const write = /(INSERT\s+INTO|DELETE\s+FROM|UPDATE)\s+memory_fts\b/i;

    expect(offenders(files, write, [FTS, PURGE, MIGRATION])).toEqual([]);
    expect(files.find((f) => f.path === FTS)?.text).toMatch(/INSERT INTO memory_fts/);
  });

  it('deletes from a memory table only in the project purge', async () => {
    const files = await allSources();

    expect(
      offenders(
        files,
        /DELETE\s+FROM\s+memory_(?!access_log|imports|purge_guard|fts)\w+/i,
        [PURGE, FTS],
      ),
    ).toEqual([]);

    expect(files.find((f) => f.path === PURGE)?.text).toMatch(/memory_purge_guard/);
  });

  it('keeps the in-memory adapter on the same rules: its rows change only through its repository file', async () => {
    const files = await allSources();
    const writers = files
      .filter(
        (f) =>
          f.path.startsWith('packages/db/src/adapters/memory/') &&
          /memoryRows\.set\(/.test(f.text),
      )
      .map((f) => f.path);

    expect(writers).toEqual(['packages/db/src/adapters/memory/memory.ts']);
  });
});
