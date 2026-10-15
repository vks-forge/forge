/**
 * Reading the install token from the data home.
 *
 * Why: every `forge` call to the server's API proves itself with the install token the server
 *   created on first start. The CLI runs as the same user, so it reads the file the server
 *   wrote (user-only on disk) rather than being told the token. A missing or malformed file
 *   is reported as what it usually is: the server never started on this data home, or the CLI
 *   points at a different one. The token is returned to the caller and never printed.
 *
 * Exports: readInstallToken().
 * Depends on: @forge/core (ForgeError), types/daemon. IO: reads the token file.
 */

import { ForgeError } from '@forge/core';
import type { DaemonPorts } from '#/types/daemon.types.js';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** The token in `<dataHome>/install-token`; throws a ForgeError (family `auth`) when it is absent or malformed. */
export async function readInstallToken(
  ports: Pick<DaemonPorts, 'layout' | 'readText'>,
): Promise<string> {
  const path = (await ports.layout()).installTokenPath;
  const token = (await ports.readText(path))?.trim();
  if (token === undefined || !TOKEN.test(token)) {
    throw new ForgeError(
      'auth',
      `no valid install token at ${path}; start Forge once with \`forge start\` (or check FORGE_HOME)`,
    );
  }

  return token;
}
