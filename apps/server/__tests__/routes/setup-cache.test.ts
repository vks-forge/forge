/**
 * Pins: `GET /settings/setup-cache` reports the bytes held by the copied install folders and by
 * the shared downloads; `POST /settings/setup-cache/clear` empties only `setup/` by default and
 * `downloads/` too only when `include_downloads` is true, answers the bytes it freed, refuses an
 * unknown or missing flag, and leaves the cache folders themselves in place.
 *
 * Why: clearing deletes files on the owner's disk. Losing the shared downloads makes every
 *   project's next install slow, so it must be an explicit choice, and a typo in the body must
 *   never widen what is removed.
 * Depends on: src/routes/setup-cache, helpers/http-rig, helpers/temp. IO: a temp folder and a loopback socket.
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupCacheRoutes } from '#/routes/setup-cache.js';
import type { RouteDeps } from '#/types/routes.types.js';
import { startHttp } from '#tests/helpers/http-rig.js';
import type { HttpRig } from '#tests/helpers/http-rig.js';
import { makeCanonicalTempDir } from '#tests/helpers/temp.js';

let home: string;
let rig: HttpRig;
let clock: number;

async function put(relative: string, bytes: number): Promise<void> {
  const file = join(home, 'cache', relative);
  await mkdir(join(file, '..'), { recursive: true });
  await writeFile(file, Buffer.alloc(bytes));
}

beforeEach(async () => {
  home = makeCanonicalTempDir('setup-cache-route');
  clock = 1_000;
  await put('setup/key-a/node_modules/a.bin', 1000);
  await put('setup/key-b/node_modules/b.bin', 500);
  await put('downloads/npm/pkg.tgz', 200);

  rig = await startHttp(
    setupCacheRoutes({
      dataHome: { home },
      now: () => clock,
    } as unknown as RouteDeps),
  );
});

afterEach(async () => {
  await rig.close();
});

const sizes = async () =>
  (await rig.json('GET', '/settings/setup-cache')).body as {
    setup_bytes: number;
    downloads_bytes: number;
  };

describe('GET /settings/setup-cache', () => {
  it('reports the two sizes', async () => {
    expect(await sizes()).toEqual({ setup_bytes: 1500, downloads_bytes: 200 });
  });

  it('reuses a measurement for a minute, then measures again', async () => {
    await sizes();
    await put('setup/key-c/x.bin', 100);

    expect((await sizes()).setup_bytes).toBe(1500);

    clock += 61_000;

    expect((await sizes()).setup_bytes).toBe(1600);
  });

  it('reads an absent cache folder as zero', async () => {
    const empty = makeCanonicalTempDir('setup-cache-none');
    const other = await startHttp(
      setupCacheRoutes({
        dataHome: { home: empty },
        now: () => 0,
      } as unknown as RouteDeps),
    );

    try {
      expect((await other.json('GET', '/settings/setup-cache')).body).toEqual({
        setup_bytes: 0,
        downloads_bytes: 0,
      });
    } finally {
      await other.close();
    }
  });
});

describe('POST /settings/setup-cache/clear', () => {
  it('empties only setup/ by default and says how much it freed', async () => {
    const res = await rig.json('POST', '/settings/setup-cache/clear', {
      include_downloads: false,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ freed_bytes: 1500, cleared: ['setup'] });
    expect(existsSync(join(home, 'cache', 'setup', 'key-a'))).toBe(false);
    expect(existsSync(join(home, 'cache', 'downloads', 'npm', 'pkg.tgz'))).toBe(true);
    expect(await sizes()).toEqual({ setup_bytes: 0, downloads_bytes: 200 });
  });

  it('also empties downloads/ when asked', async () => {
    const res = await rig.json('POST', '/settings/setup-cache/clear', {
      include_downloads: true,
    });

    expect(res.body).toEqual({ freed_bytes: 1700, cleared: ['setup', 'downloads'] });
    expect(existsSync(join(home, 'cache', 'downloads', 'npm'))).toBe(false);
    expect(existsSync(join(home, 'cache', 'downloads'))).toBe(true);
    expect(await sizes()).toEqual({ setup_bytes: 0, downloads_bytes: 0 });
  });

  it('refuses a body with a missing or unknown flag, and deletes nothing', async () => {
    for (const body of [
      {},
      { include_downloads: 'yes' },
      { include_downloads: true, all: 1 },
    ]) {
      const res = await rig.json('POST', '/settings/setup-cache/clear', body);

      expect(res.status).toBe(400);
    }

    expect(existsSync(join(home, 'cache', 'setup', 'key-a'))).toBe(true);
  });
});
