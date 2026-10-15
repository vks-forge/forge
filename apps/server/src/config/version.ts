/**
 * The server's own version, read from its package.json.
 *
 * Why: `server.json` records which build is running so `forge status` can show it and a
 *   later release can tell a stale background server from a fresh one. One resolver keeps
 *   the number out of code: the app's `package.json` sits two folders above this file
 *   whether it runs from `src/` or `dist/`.
 *
 * Exports: readServerVersion().
 * Depends on: node:fs/promises, node:url. IO: reads package.json.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** Version string of `apps/server/package.json`; `unknown` when it cannot be read. */
export async function readServerVersion(
  moduleUrl: string = import.meta.url,
): Promise<string> {
  try {
    const text = await readFile(
      fileURLToPath(new URL('../../package.json', moduleUrl)),
      'utf8',
    );

    const version = (JSON.parse(text) as { version?: unknown }).version;

    return typeof version === 'string' && version !== '' ? version : 'unknown';
  } catch {
    return 'unknown';
  }
}
