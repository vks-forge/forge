/**
 * End to end: with FORGE_TRACE unset the server writes no trace and says so once.
 *
 * Why: the debug trace (d-0163) is off by default and must cost nothing: no folder in the data
 *   home, no files, not even when cards are created and work runs. A server whose owner never
 *   asked for tracing must not slowly fill a disk with prompts and tool output.
 *
 * Pins: a card created over HTTP leaves no `logs/trace` folder in the data home, the start-up log
 *   has the single "debug trace is off" line and no "is on" line, and an explicit
 *   `FORGE_TRACE=0` behaves the same.
 * Depends on: helpers/e2e-rig. IO: git, SQLite, a loopback socket.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startE2eRig } from '#tests/helpers/e2e-rig.js';
import type { E2eRig } from '#tests/helpers/e2e-rig.js';

let rig: E2eRig | undefined;

afterEach(async () => {
  await rig?.dispose();
  rig = undefined;
});

describe('debug trace off', { timeout: 120_000 }, () => {
  it.each([
    ['unset', undefined],
    ['0', { FORGE_TRACE: '0' }],
  ])('creates no trace folder when FORGE_TRACE is %s', async (_name, env) => {
    rig = await startE2eRig(['good'], env ? { env } : {});

    const created = await rig.call('POST', '/projects/fixture/cards', {
      title: 'Add an add function',
      description: 'Add add(a, b) to src/math.js and a test for it.',
      type: 'discussion',
      dedupe_key: 'off-1',
    });

    expect(created.status).toBe(201);
    expect(existsSync(join(rig.fixture.dataHome, 'logs', 'trace'))).toBe(false);
    expect(rig.logs.filter((l) => l.includes('debug trace is off'))).toHaveLength(1);
    expect(rig.logs.some((l) => l.includes('debug trace is on'))).toBe(false);
  });
});
