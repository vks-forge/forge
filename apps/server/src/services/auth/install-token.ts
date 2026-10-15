/**
 * The install token: created on first start, kept in a user-only file in the data home.
 *
 * Why: the API listens on loopback, but any program running as any user on this machine can
 *   reach loopback, so "local" is not a credential. One random token per installation, in a
 *   file only the current user can read, is what lets the CLI and (later) the control room
 *   prove they act for the owner. The file is created with 0600 where the OS has modes; on
 *   Windows the ACL is cut down to the current user through `icacls`. If that fails the
 *   server still starts (a locked-down machine must not be unable to run Forge) but says so
 *   in the log. The restriction is applied on every start, not only on creation, so a file
 *   whose ACL was widened since (a restored backup, a copied data folder) is narrowed again.
 *   The token itself is never logged. A file that does not hold a well-formed
 *   token (truncated by a crash, edited by hand) is replaced, because starting with a token
 *   nobody can type correctly would lock the owner out silently.
 *
 * Exports: INSTALL_TOKEN_PATTERN, ensureInstallToken().
 * Depends on: node:crypto, node:fs/promises, node:path, @forge/engine (Logger type),
 *   types/auth. IO: reads and writes the token file.
 */

import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Logger } from '@forge/engine';
import type { RestrictFile } from '#/types/auth.types.js';

/** 32 random bytes in base64url: 43 characters. */
export const INSTALL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

async function readToken(path: string): Promise<string | null> {
  try {
    const text = (await readFile(path, 'utf8')).trim();

    return INSTALL_TOKEN_PATTERN.test(text) ? text : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

/** Narrows `path` to the current user; a failure warns (without the token) and does not stop the start. */
async function restrictToUser(
  path: string,
  deps: { readonly restrict: RestrictFile; readonly log: Logger },
): Promise<void> {
  try {
    // A replaced file keeps its old mode on POSIX, so narrow it explicitly either way.
    await chmod(path, 0o600);
    await deps.restrict(path);
  } catch (error) {
    deps.log('warn', 'could not restrict the install token file to the current user', {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Returns the install token at `path`, creating the file on first use; the file is restricted on every call. */
export async function ensureInstallToken(
  path: string,
  deps: { readonly restrict: RestrictFile; readonly log: Logger },
): Promise<string> {
  const existing = await readToken(path);
  if (existing) {
    await restrictToUser(path, deps);

    return existing;
  }

  const token = randomBytes(32).toString('base64url');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${token}\n`, { mode: 0o600 });
  await restrictToUser(path, deps);

  return token;
}
