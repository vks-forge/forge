/**
 * Windows DPAPI implementation of the SecretStore port.
 *
 * Why: the GitHub App private key must be usable by the server yet never sit as plaintext
 *   in the repo or `.forge/` config (d-0062). DPAPI with CurrentUser scope binds the
 *   encrypted blob to the Windows account that wrote it: the file under
 *   `.forge/data/secrets/<name>.dpapi` is useless if copied elsewhere, and no master
 *   password has to be stored. Writes are atomic (temp file then rename) so a crash never
 *   leaves a half-written blob that would decrypt to garbage or fail forever. On other
 *   platforms the constructor throws instead of silently storing plaintext.
 *
 * Exports: createDpapiSecretStore().
 * Depends on: node:fs/promises, node:path, @forge/core, adapters/dpapi/powershell, shared/secret-name.
 *   IO: reads and writes `<dir>/<name>.dpapi`, spawns powershell.exe.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PolicyDeniedError } from '@forge/core';
import type { SecretStore } from '@forge/core';
import { dpapiProtect, dpapiUnprotect } from '#/adapters/dpapi/powershell.js';
import type { DpapiSecretStoreOptions } from '#/types/dpapi.types.js';
import { assertSecretName } from '#/shared/secret-name.js';

/** Creates a SecretStore that keeps DPAPI-encrypted blobs in `dir`. Throws PolicyDeniedError off Windows. */
export function createDpapiSecretStore(opts: DpapiSecretStoreOptions): SecretStore {
  if ((opts.platform ?? process.platform) !== 'win32') {
    throw new PolicyDeniedError(
      'the DPAPI secret store only works on Windows; refusing to fall back to plaintext',
    );
  }

  const dir = resolve(opts.dir);
  const fileOf = (name: string): string => join(dir, `${name}.dpapi`);

  return {
    async get(name) {
      assertSecretName(name);
      let blob: Buffer;
      try {
        blob = await readFile(fileOf(name));
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
          return null;
        }

        throw cause;
      }

      return dpapiUnprotect(blob, opts);
    },

    async put(name, bytes) {
      assertSecretName(name);
      const blob = await dpapiProtect(bytes, opts);
      await mkdir(dir, { recursive: true });
      const tmp = `${fileOf(name)}.${process.pid}.tmp`;
      await writeFile(tmp, blob);
      await rename(tmp, fileOf(name));
    },
  };
}
