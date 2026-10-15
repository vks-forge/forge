/**
 * The build check before a Worker start: refuse a changed build, record the build on the run.
 *
 * Why: when a Worker misbehaves the owner needs to know which `claude` build ran it, and
 *   a run must never start on a build whose approvals were not loaded. The check ties both
 *   together at the one moment before the harness starts.
 *
 * Pins: the installed build is written to the run row's driver_version; a refusal propagates
 *   and leaves the row untouched; no known build leaves the placeholder.
 * Depends on: src/services/build-check, @forge/db (memory). No IO.
 */

import { HarnessChangedError } from '@forge/core';
import type { Run } from '@forge/core';
import { createMemoryStorage } from '@forge/db';
import { describe, expect, it } from 'vitest';
import { createBuildCheck } from '#/services/build-check.js';

const RUN: Run = {
  id: 'run-1',
  ticket_id: 'FG-1',
  project: 'forge',
  harness: 'claude-code',
  driver_version: 'unversioned',
  cwd: '/w',
  lane: 'express',
  started_at: '2026-10-14T00:00:00.000Z',
  status: 'starting',
  owner: 'srv',
};

async function setup() {
  const storage = createMemoryStorage();
  await storage.transaction((tx) => tx.runs.insert(RUN));

  return storage;
}

const versionOf = async (storage: Awaited<ReturnType<typeof setup>>) =>
  (await storage.transaction((tx) => tx.runs.get('run-1')))?.driver_version;

describe('createBuildCheck', () => {
  it('records the installed build on the run row', async () => {
    const storage = await setup();
    const check = createBuildCheck({
      compat: { assertCurrent: async () => '2.1.0' },
      storage,
      harnessId: 'claude',
    });

    await check('run-1');

    expect(await versionOf(storage)).toBe('2.1.0');
  });

  it('lets the refusal through and leaves the row alone', async () => {
    const storage = await setup();
    const check = createBuildCheck({
      compat: {
        assertCurrent: async () => {
          throw new HarnessChangedError('2.1.0', '2.2.0');
        },
      },
      storage,
      harnessId: 'claude',
    });

    await expect(check('run-1')).rejects.toBeInstanceOf(HarnessChangedError);
    expect(await versionOf(storage)).toBe('unversioned');
  });

  it('leaves the placeholder when no build is known', async () => {
    const storage = await setup();
    const check = createBuildCheck({
      compat: { assertCurrent: async () => null },
      storage,
      harnessId: 'claude',
    });

    await check('run-1');

    expect(await versionOf(storage)).toBe('unversioned');
  });
});
