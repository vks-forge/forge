/**
 * Stub routes for the setup cache: its size and the clear action.
 *
 * Why: the settings screen shows the cache size and re-reads it after "Clear setup cache", so the
 *   stub keeps its own sizes: a clear empties the installs (and the downloads when asked) and the
 *   next read sees it, the same shape the server answers. State is per call, so each test starts
 *   with 1.5 GB of saved installs and 200 MB of shared downloads.
 *
 * Exports: setupCacheRoutes().
 * Depends on: helpers/fetch-stub.
 */

import { json } from '#tests/helpers/fetch-stub.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';

export function setupCacheRoutes(): Routes {
  const cache = { setup_bytes: 1_610_612_736, downloads_bytes: 209_715_200 };

  return {
    'GET /settings/setup-cache': () => json({ ...cache }),

    'POST /settings/setup-cache/clear': ({ body }) => {
      const all = (body as { include_downloads: boolean }).include_downloads;
      const freed = cache.setup_bytes + (all ? cache.downloads_bytes : 0);
      cache.setup_bytes = 0;
      cache.downloads_bytes = all ? 0 : cache.downloads_bytes;

      return json({
        freed_bytes: freed,
        cleared: all ? ['setup', 'downloads'] : ['setup'],
      });
    },
  };
}
