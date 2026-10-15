/**
 * Writing and removing `server.json`, the record of the running server.
 *
 * Why: `forge status` and `forge stop` find the server through this file (pid, port, start
 *   time, build). It is written only after the port is bound, so its existence means "was
 *   listening", and it is written to a temp name and renamed so a reader never sees half a
 *   document. On a clean exit it is removed, but only when it still names this process: a
 *   server that lost its lock to a successor must not delete the successor's record.
 *
 * Exports: writeServerRecord(), removeServerRecord().
 * Depends on: node:fs/promises, @forge/core (ServerRecord). IO: the data home file.
 */

import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { ServerRecord } from '@forge/core';

export async function writeServerRecord(
  path: string,
  record: ServerRecord,
): Promise<void> {
  const temp = `${path}.${record.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(ServerRecord.parse(record), null, 2)}\n`);
  await rename(temp, path);
}

/** Removes the record when it names `pid`; never throws. */
export async function removeServerRecord(path: string, pid: number): Promise<void> {
  try {
    const parsed = ServerRecord.safeParse(JSON.parse(await readFile(path, 'utf8')));
    if (parsed.success && parsed.data.pid === pid) {
      await rm(path, { force: true });
    }
  } catch {
    // Missing or unreadable: nothing of ours to remove.
  }
}
