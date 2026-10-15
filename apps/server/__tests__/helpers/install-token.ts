/**
 * The install token in tests: a fixed one for in-memory rigs, a file reader for real servers.
 *
 * Why: every API route now needs `Authorization: Bearer <install token>`. Rigs that build the
 *   router themselves choose the token (`TEST_INSTALL_TOKEN`); rigs and probes that start the
 *   real assembly read the one the server created in the temp data home, exactly as the CLI
 *   does. One helper keeps the header shape in one place.
 *
 * Exports: TEST_INSTALL_TOKEN, bearer(), readInstallToken().
 * Depends on: node:fs/promises. IO: reads the token file.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** The token in-memory rigs install; 43 base64url characters like a real one. */
export const TEST_INSTALL_TOKEN = 'test-install-token-0123456789ABCDEFGHIJKLMNOP';

/** The `Authorization` header for `token`. */
export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/** The token the server wrote under a (temp) data home. */
export async function readInstallToken(dataHome: string): Promise<string> {
  return (await readFile(join(dataHome, 'install-token'), 'utf8')).trim();
}
