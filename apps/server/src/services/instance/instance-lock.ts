/**
 * Single-instance lock: `server.lock` in the data home.
 *
 * Why: two servers on one data home would both tick the same database, both claim the same
 *   tickets and both believe they own every live run (the second start's reconcile would
 *   crash the first one's runs). The lock is a file created exclusively (`wx`) holding the
 *   owner's pid; a second start finds it, sees that process alive, and refuses with a message
 *   that names the pid and the command to stop it. A crash leaves the file behind, so a lock
 *   whose pid is dead is stale and is taken over. A lock file that is still empty is another
 *   server in the middle of creating it and counts as held for a few seconds.
 *
 * Exports: AlreadyRunningError, acquireInstanceLock().
 * Depends on: node:fs/promises, @forge/core (ForgeError), types/auth. IO: creates, reads and
 *   removes the lock file.
 */

import { open, readFile, rm, stat } from 'node:fs/promises';
import { ForgeError } from '@forge/core';
import type { InstanceLock, InstanceLockIo } from '#/types/auth.types.js';

const FRESH_EMPTY_LOCK_MS = 5_000;

/** Another live server holds the lock; family `policy_denied`. */
export class AlreadyRunningError extends ForgeError {
  constructor(pid: number | null) {
    super(
      'policy_denied',
      `a Forge server is already running on this data home${
        pid === null ? '' : ` (pid ${pid})`
      }; run \`forge stop\` first`,
    );
  }
}

/** The pid in the lock file, `null` when it is empty, `undefined` when it cannot be read as one. */
async function ownerOf(path: string): Promise<number | null | undefined> {
  try {
    const text = (await readFile(path, 'utf8')).trim();
    if (text === '') {
      return null;
    }

    const pid = (JSON.parse(text) as { pid?: unknown }).pid;

    return typeof pid === 'number' && Number.isInteger(pid) ? pid : undefined;
  } catch {
    return undefined;
  }
}

async function isHeld(path: string, io: InstanceLockIo): Promise<number | null | false> {
  const owner = await ownerOf(path);
  if (typeof owner === 'number') {
    return owner !== io.pid && io.isAlive(owner) ? owner : false;
  }

  if (owner === null) {
    try {
      return Date.now() - (await stat(path)).mtimeMs < FRESH_EMPTY_LOCK_MS ? null : false;
    } catch {
      return false;
    }
  }

  return false;
}

/** Takes the lock or throws AlreadyRunningError; a stale lock (dead pid) is replaced. */
export async function acquireInstanceLock(
  path: string,
  io: InstanceLockIo,
): Promise<InstanceLock> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, 'wx');
      try {
        await handle.writeFile(
          JSON.stringify({ pid: io.pid, startedAt: new Date().toISOString() }),
        );
      } finally {
        await handle.close();
      }

      return {
        async release() {
          if ((await ownerOf(path)) === io.pid) {
            await rm(path, { force: true }).catch(() => undefined);
          }
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }

    const held = await isHeld(path, io);
    if (held !== false) {
      throw new AlreadyRunningError(held);
    }

    await rm(path, { force: true });
  }

  throw new AlreadyRunningError(null);
}
