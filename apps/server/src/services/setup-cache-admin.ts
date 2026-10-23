/**
 * Setup cache admin: how much disk Forge's setup cache uses, and a way to empty it.
 *
 * Why: setup steps keep two things under `<data home>/cache`: copies of install folders in
 *   `setup/` (what makes a second ticket's workspace ready in seconds) and the package managers'
 *   shared downloads in `downloads/`. They grow to the size limit and the owner must be able to
 *   see that and reclaim the space, for example when a project's dependencies changed a lot or
 *   the disk is short. Clearing `setup/` is always safe (the next ticket installs once and
 *   stores again); clearing `downloads/` too only makes the next installs download again, so it
 *   is a separate choice. Walking a big folder is slow, so sizes are kept for a minute.
 *
 * Exports: GB, SIZES_TTL_MS, setupCacheBudget(), createSetupCacheAdmin().
 * Depends on: node:fs/promises, node:path, @forge/core (ConfigSource type), types/setup-cache.types. IO: reads and deletes under the cache folder only.
 */

import { lstat, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConfigSource } from '@forge/core';
import type {
  SetupCacheAdmin,
  SetupCacheAdminDeps,
  SetupCacheSizes,
} from '#/types/setup-cache.types.js';

export const GB = 1024 ** 3;

/** How long a measured size is reused. */
export const SIZES_TTL_MS = 60_000;

/**
 * The size limit of the copied-install cache, in bytes, read from the company settings
 * (`engine.setup_cache_gb`) each time it is asked, so a saved change applies to the next store.
 */
export function setupCacheBudget(config: ConfigSource): () => Promise<number> {
  return async () => (await config.company()).config.engine.setup_cache_gb * GB;
}

/** Bytes of the files under `path`; links are counted as themselves, never followed, and a vanished file counts 0. */
async function folderBytes(path: string): Promise<number> {
  const info = await lstat(path).catch(() => null);

  if (info === null) {
    return 0;
  }

  if (!info.isDirectory()) {
    return info.size;
  }

  const names = await readdir(path).catch(() => []);
  const sizes = await Promise.all(names.map((name) => folderBytes(join(path, name))));

  return sizes.reduce((sum, n) => sum + n, 0);
}

/** Removes every entry inside `folder` (the folder stays) and returns the bytes it held. */
async function emptyFolder(folder: string): Promise<number> {
  const names = await readdir(folder).catch(() => []);
  const sizes = await Promise.all(
    names.map(async (name) => {
      const path = join(folder, name);
      const bytes = await folderBytes(path);
      await rm(path, { recursive: true, force: true });

      return bytes;
    }),
  );

  return sizes.reduce((sum, n) => sum + n, 0);
}

export function createSetupCacheAdmin(deps: SetupCacheAdminDeps): SetupCacheAdmin {
  const setupDir = join(deps.cacheDir, 'setup');
  const downloadsDir = join(deps.cacheDir, 'downloads');
  let cached: { at: number; sizes: SetupCacheSizes } | undefined;

  return {
    async sizes() {
      const now = deps.now();

      if (cached !== undefined && now - cached.at < SIZES_TTL_MS) {
        return cached.sizes;
      }

      const [setup_bytes, downloads_bytes] = await Promise.all([
        folderBytes(setupDir),
        folderBytes(downloadsDir),
      ]);

      cached = { at: now, sizes: { setup_bytes, downloads_bytes } };

      return cached.sizes;
    },

    async clear(includeDownloads) {
      const setup = await emptyFolder(setupDir);
      const downloads = includeDownloads ? await emptyFolder(downloadsDir) : 0;
      cached = undefined;

      return {
        freed_bytes: setup + downloads,
        cleared: includeDownloads ? ['setup', 'downloads'] : ['setup'],
      };
    },
  };
}
