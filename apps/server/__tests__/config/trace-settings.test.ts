/**
 * Trace switches in the server environment and settings.
 *
 * Why: the debug trace log (d-0163) is off unless the owner sets `FORGE_TRACE`, and a typo in
 *   `FORGE_TRACE_KEEP_DAYS` must stop start-up with the variable named rather than silently
 *   keeping or deleting files. Where the files go defaults to `<dataHome>/logs/trace`, so a
 *   test or a dev build can point them elsewhere without touching the real data home.
 *
 * Pins: off by default, `1`/`true` turn it on, blank is unset, default directory and 14 days,
 *   override of both, a bad keep-days value is rejected, settings carry the resolved values.
 * Depends on: src/config/load-settings, vitest.
 */

import { join } from 'node:path';
import { InvalidInputError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { loadSettings, readServerEnv } from '#/config/load-settings.js';

const io = { platform: 'win32' as const, homedir: 'C:\\Users\\Ana', readText: async () => undefined };

describe('trace env', () => {
  it('is off by default with 14 days of retention', () => {
    const env = readServerEnv({});

    expect(env.FORGE_TRACE).toBe(false);
    expect(env.FORGE_TRACE_KEEP_DAYS).toBe(14);
    expect(env.FORGE_TRACE_DIR).toBeUndefined();
  });

  it.each(['1', 'true', 'TRUE'])('turns on for %s', (value) => {
    expect(readServerEnv({ FORGE_TRACE: value }).FORGE_TRACE).toBe(true);
  });

  it.each(['', '0', 'false', 'no'])('stays off for %j', (value) => {
    expect(readServerEnv({ FORGE_TRACE: value }).FORGE_TRACE).toBe(false);
  });

  it('rejects a bad keep-days value naming the variable', () => {
    expect(() => readServerEnv({ FORGE_TRACE_KEEP_DAYS: 'x' })).toThrow(InvalidInputError);
    expect(() => readServerEnv({ FORGE_TRACE_KEEP_DAYS: '0' })).toThrow(
      'FORGE_TRACE_KEEP_DAYS',
    );
  });
});

describe('trace settings', () => {
  it('defaults the directory under the data home logs', async () => {
    const s = await loadSettings({ FORGE_HOME: 'E:\\dev-home', FORGE_TRACE: '1' }, 'E:\\repo', io);

    expect(s.trace).toEqual({
      enabled: true,
      dir: join(s.layout.data.logsDir, 'trace'),
      keepDays: 14,
    });
  });

  it('honours the directory and keep-days overrides', async () => {
    const s = await loadSettings(
      {
        FORGE_HOME: 'E:\\dev-home',
        FORGE_TRACE: 'true',
        FORGE_TRACE_DIR: 'D:\\t',
        FORGE_TRACE_KEEP_DAYS: '3',
      },
      'E:\\repo',
      io,
    );

    expect(s.trace).toEqual({ enabled: true, dir: 'D:\\t', keepDays: 3 });
  });

  it('is disabled when the switch is unset', async () => {
    const s = await loadSettings({ FORGE_HOME: 'E:\\dev-home' }, 'E:\\repo', io);

    expect(s.trace?.enabled).toBe(false);
  });
});
