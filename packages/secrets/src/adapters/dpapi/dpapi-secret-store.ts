/**
 * Windows DPAPI implementation of the SecretStore port.
 *
 * Why: the GitHub App private key, harness credentials and run secrets must be usable by
 *   the server yet never sit as plaintext in the repo or config (d-0062). DPAPI with
 *   CurrentUser scope binds the encrypted blob to the Windows account that wrote it: the
 *   file `<dir>/<name>.dpapi` is useless if copied elsewhere, and no master password has
 *   to be stored. A namespaced name `a/b/c` is the file `<dir>/a/b/c.dpapi`, so one
 *   directory walk lists a kind of secret and deleting the last one of a namespace leaves
 *   no empty folders behind (d-0100). Writes are atomic (temp file then rename) so a crash
 *   never leaves a half-written blob that would decrypt to garbage or fail forever. Every
 *   resolved path is checked to stay inside `<dir>` as a second line behind name
 *   validation. On other platforms the constructor throws instead of silently storing
 *   plaintext.
 *
 * Exports: createDpapiSecretStore().
 * Depends on: node:fs/promises, node:path, @forge/core, adapters/dpapi/powershell.
 *   IO: reads and writes `<dir>/<name>.dpapi`, spawns powershell.exe.
 */

import {
  mkdir,
  readFile,
  readdir,
  rename,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import {
  InvalidInputError,
  PolicyDeniedError,
  SecretName,
  assertSecretName,
  assertSecretPrefix,
} from '@forge/core';
import type { SecretStore } from '@forge/core';
import { dpapiProtect, dpapiUnprotect } from '#/adapters/dpapi/powershell.js';
import type { DpapiSecretStoreOptions } from '#/types/dpapi.types.js';

const EXT = '.dpapi';

const isCode = (cause: unknown, ...codes: string[]): boolean =>
  codes.includes((cause as NodeJS.ErrnoException).code ?? '');

/** Creates a SecretStore that keeps DPAPI-encrypted blobs in `dir`. Throws PolicyDeniedError off Windows. */
export function createDpapiSecretStore(opts: DpapiSecretStoreOptions): SecretStore {
  if ((opts.platform ?? process.platform) !== 'win32') {
    throw new PolicyDeniedError(
      'the DPAPI secret store only works on Windows; refusing to fall back to plaintext',
    );
  }

  const dir = resolve(opts.dir);

  const fileOf = (name: string): string => {
    assertSecretName(name);
    const file = resolve(dir, ...name.split('/')) + EXT;
    const rel = relative(dir, file);

    if (rel === '' || rel.startsWith('..') || resolve(dir, rel) !== file) {
      throw new InvalidInputError(`secret name resolves outside the store: ${name}`);
    }

    return file;
  };

  /** Stored names under `base` (a directory inside `dir`), as `/`-joined strings. */
  const walk = async (base: string): Promise<string[]> => {
    let entries;
    try {
      entries = await readdir(base, { withFileTypes: true });
    } catch (cause) {
      if (isCode(cause, 'ENOENT', 'ENOTDIR')) {
        return [];
      }

      throw cause;
    }

    const names: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        names.push(...(await walk(join(base, entry.name))));
      } else if (entry.isFile() && entry.name.endsWith(EXT)) {
        const rel = relative(dir, join(base, entry.name)).slice(0, -EXT.length);
        names.push(rel.split(sep).join('/'));
      }
    }

    return names;
  };

  return {
    async get(name) {
      let blob: Buffer;
      try {
        blob = await readFile(fileOf(name));
      } catch (cause) {
        if (isCode(cause, 'ENOENT', 'ENOTDIR')) {
          return null;
        }

        throw cause;
      }

      return dpapiUnprotect(blob, opts);
    },

    async put(name, bytes) {
      const file = fileOf(name);
      const blob = await dpapiProtect(bytes, opts);
      await mkdir(dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, blob);
      await rename(tmp, file);
    },

    async delete(name) {
      const file = fileOf(name);
      try {
        await unlink(file);
      } catch (cause) {
        if (isCode(cause, 'ENOENT', 'ENOTDIR')) {
          return;
        }

        throw cause;
      }

      // Prune folders the removal left empty, never `dir` itself or anything above it.
      for (let parent = dirname(file); parent !== dir && relative(dir, parent) !== '';) {
        try {
          await rmdir(parent);
        } catch {
          return;
        }

        parent = dirname(parent);
      }
    },

    async list(prefix) {
      assertSecretPrefix(prefix);
      const all = await walk(dir);

      return all
        .filter((name) => SecretName.safeParse(name).success && name.startsWith(prefix))
        .sort();
    },
  };
}
