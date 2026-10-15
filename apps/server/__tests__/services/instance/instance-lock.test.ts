/**
 * The single-instance lock and the `server.json` record.
 *
 * Why: two servers on one data home would tick the same database and crash each other's runs,
 *   so the second must be refused with the first one's pid. But a crash leaves the lock file
 *   behind, and a Forge that can never restart after a crash is worse than none: a lock whose
 *   owner is dead must be taken over. The record is how `forge stop` finds the server; it must
 *   be removed only by the process it names.
 *
 * Pins: first acquire creates the file with the pid; a live owner refuses with its pid; a dead
 *   owner is replaced; an unreadable old lock is replaced; a fresh empty lock counts as held;
 *   release removes only an own lock; writing and removing the record, including the pid check.
 * Depends on: src/services/instance/{instance-lock,server-record}, helpers/temp. IO: temp files.
 */

import { mkdir, readFile, utimes, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AlreadyRunningError,
  acquireInstanceLock,
} from '#/services/instance/instance-lock.js';
import {
  removeServerRecord,
  writeServerRecord,
} from '#/services/instance/server-record.js';
import { processIsAlive } from '#/services/instance/process-alive.js';
import { makeTempDir } from '#tests/helpers/temp.js';

const dir = (): string => makeTempDir('forge-lock-');
const alive = (...pids: number[]) => ({ isAlive: (pid: number) => pids.includes(pid) });

describe('acquireInstanceLock', () => {
  it('creates the lock holding this pid', async () => {
    const path = join(dir(), 'server.lock');

    await acquireInstanceLock(path, { pid: 100, ...alive() });

    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ pid: 100 });
  });

  it('refuses a second instance while the first is alive, naming its pid', async () => {
    const path = join(dir(), 'server.lock');
    await acquireInstanceLock(path, { pid: 100, ...alive(100) });

    const second = acquireInstanceLock(path, { pid: 200, ...alive(100, 200) });

    await expect(second).rejects.toBeInstanceOf(AlreadyRunningError);
    await expect(second).rejects.toThrow(/pid 100.*forge stop/);
  });

  it('takes over a lock whose owner is dead', async () => {
    const path = join(dir(), 'server.lock');
    await acquireInstanceLock(path, { pid: 100, ...alive() });

    await acquireInstanceLock(path, { pid: 200, ...alive(200) });

    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ pid: 200 });
  });

  it('takes over a lock file that holds garbage', async () => {
    const path = join(dir(), 'server.lock');
    await writeFile(path, 'not json');

    await acquireInstanceLock(path, { pid: 200, ...alive(200) });

    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ pid: 200 });
  });

  it('treats a just-created empty lock as held, and an old empty one as stale', async () => {
    const path = join(dir(), 'server.lock');
    await writeFile(path, '');

    await expect(
      acquireInstanceLock(path, { pid: 200, ...alive() }),
    ).rejects.toBeInstanceOf(AlreadyRunningError);

    const old = new Date(Date.now() - 60_000);
    await utimes(path, old, old);
    await acquireInstanceLock(path, { pid: 200, ...alive() });

    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ pid: 200 });
  });

  it('rethrows an error that is not "already exists"', async () => {
    const path = join(dir(), 'missing-folder', 'server.lock');

    await expect(acquireInstanceLock(path, { pid: 1, ...alive() })).rejects.toMatchObject(
      {
        code: 'ENOENT',
      },
    );
  });

  it('release removes the own lock only', async () => {
    const path = join(dir(), 'server.lock');
    const lock = await acquireInstanceLock(path, { pid: 100, ...alive() });
    await writeFile(path, JSON.stringify({ pid: 999 }));

    await lock.release();
    expect(existsSync(path)).toBe(true);

    await writeFile(path, JSON.stringify({ pid: 100 }));
    await lock.release();
    expect(existsSync(path)).toBe(false);
  });
});

describe('server record', () => {
  const record = {
    pid: 100,
    port: 4310,
    startedAt: '2026-10-15T10:00:00.000Z',
    version: '0.0.0',
  };

  it('is written whole and removed by its own pid', async () => {
    const path = join(dir(), 'server.json');

    await writeServerRecord(path, record);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(record);

    await removeServerRecord(path, 100);
    expect(existsSync(path)).toBe(false);
  });

  it('is left alone when it names another process', async () => {
    const path = join(dir(), 'server.json');
    await writeServerRecord(path, record);

    await removeServerRecord(path, 555);

    expect(existsSync(path)).toBe(true);
  });

  it('removal tolerates a missing or broken file', async () => {
    const folder = dir();
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'broken.json'), '{');

    await removeServerRecord(join(folder, 'absent.json'), 1);
    await removeServerRecord(join(folder, 'broken.json'), 1);

    expect(existsSync(join(folder, 'broken.json'))).toBe(true);
  });

  it('refuses to write a record that fails the schema', async () => {
    await expect(
      writeServerRecord(join(dir(), 'server.json'), { ...record, port: 0 }),
    ).rejects.toThrow();
  });
});

describe('processIsAlive', () => {
  it('is true for this process and false for a pid that cannot exist', () => {
    expect(processIsAlive(process.pid)).toBe(true);
    expect(processIsAlive(2 ** 22 + 12_345)).toBe(false);
  });
});
