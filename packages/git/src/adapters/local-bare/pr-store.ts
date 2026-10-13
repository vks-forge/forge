/**
 * Pull-request records on disk for the local bare-repo host.
 *
 * Why: the local host needs durable PR state that survives a server restart (the engine
 *   resumes a ticket that is `verifying`) and is never half-written: a crash in the middle
 *   of a save must leave the old record intact, not a truncated file that reads as an
 *   open or missing PR. Each record is written to a temp file and renamed over the target;
 *   numbering is serialised in-process so two concurrent openPr calls cannot share a number.
 *
 * Exports: createPrStore().
 * Depends on: node:fs/promises, node:path, @forge/core (InvalidInputError), schemas/pr-record.
 *   IO: reads and writes `<remote>/forge-prs/<n>.json`.
 */

import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { InvalidInputError } from '@forge/core';
import { PrRecord } from '#/schemas/pr-record.js';
import type { PrStore } from '#/types/pr-store.types.js';

export function createPrStore(remotePath: string): PrStore {
  const dir = join(remotePath, 'forge-prs');
  let tail: Promise<unknown> = Promise.resolve();

  const locked = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };
  const file = (n: number): string => join(dir, `${n}.json`);

  const write = async (record: PrRecord): Promise<void> => {
    await mkdir(dir, { recursive: true });
    const tmp = `${file(record.number)}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(record, null, 2), 'utf8');
    await rename(tmp, file(record.number));
  };

  const read = async (n: number): Promise<PrRecord> => {
    let text: string;
    try {
      text = await readFile(file(n), 'utf8');
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT')
        throw new InvalidInputError(`no such pull request: ${n}`);
      throw cause;
    }
    return PrRecord.parse(JSON.parse(text));
  };

  return {
    locked,
    get: read,
    save: (record) => write(record),
    create: (make) =>
      locked(async () => {
        await mkdir(dir, { recursive: true });
        const names = (await readdir(dir)).filter((f) => /^\d+\.json$/.test(f));
        const existing = await Promise.all(
          names.map((f) => read(Number.parseInt(f, 10))),
        );
        const next = Math.max(0, ...existing.map((r) => r.number)) + 1;
        const record = make(next, existing);
        await write(record);
        return record;
      }),
  };
}
