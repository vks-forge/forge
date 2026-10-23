/**
 * Pins: the setup cache size limit is the company setting `engine.setup_cache_gb` (5 GB until the
 * owner changes it), read afresh each time, so saving a new value applies to the next store with
 * no restart.
 *
 * Why: the cache must not eat the owner's disk unbounded, and the limit is a setting like any other
 *   (edited in the UI, versioned), not a constant in code.
 * Depends on: @forge/db (memory config source), services/setup-cache-admin. IO: none.
 */

import { createMemoryConfigSource } from '@forge/db';
import { describe, expect, it } from 'vitest';
import { GB, setupCacheBudget } from '#/services/setup-cache-admin.js';

describe('setupCacheBudget', () => {
  it('is 5 GB by default', async () => {
    expect(await setupCacheBudget(createMemoryConfigSource())()).toBe(5 * GB);
  });

  it('follows a saved change without being rebuilt', async () => {
    const config = createMemoryConfigSource();
    const budget = setupCacheBudget(config);

    await config.append({
      scope: 'company',
      doc: { engine: { setup_cache_gb: 12 } },
      author: 'test',
      reason: 'more room',
      expectedVersion: 0,
    });

    expect(await budget()).toBe(12 * GB);
  });
});
