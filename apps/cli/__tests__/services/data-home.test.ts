/**
 * Tests for finding the data home on a machine.
 *
 * Why: the data home decides where the database and the encrypted secrets are. A server and
 *   a CLI that read different folders would look at two separate, silently empty homes. The
 *   folder is always the platform default (d-0170): there is no user-facing way to pick
 *   another, so a stray `forge-home.json` left by an older build must change nothing. The
 *   machine is a literal here, so no test touches the real `%LOCALAPPDATA%`.
 *
 * Pins: default location, FORGE_HOME replacing it (dev and tests only), a relative FORGE_HOME
 *   refused, and a stray forge-home.json in the config folder being ignored.
 * Depends on: src/services/data-home, node:fs, node:os. IO: a temp folder.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDataHome } from '#/services/data-home.js';
import type { DataHomeIo } from '#/types/data-home.types.js';

const machine = (): DataHomeIo => ({ platform: 'win32', homedir: 'C:\\Users\\Ana' });

describe('loadDataHome', () => {
  it('defaults to %LOCALAPPDATA%\\Forge', () => {
    const env = { LOCALAPPDATA: 'C:\\Users\\Ana\\AppData\\Local' };

    const layout = loadDataHome(env, machine());

    expect(layout.home).toBe('C:\\Users\\Ana\\AppData\\Local\\Forge');
    expect(layout.dbPath).toBe('C:\\Users\\Ana\\AppData\\Local\\Forge\\forge.db');
  });

  it('lets FORGE_HOME replace the default', () => {
    const layout = loadDataHome({ FORGE_HOME: 'E:\\dev-home' }, machine());

    expect(layout.home).toBe('E:\\dev-home');
  });

  it('rejects a relative FORGE_HOME', () => {
    expect(() => loadDataHome({ FORGE_HOME: 'here' }, machine())).toThrow(
      /FORGE_HOME must be an absolute path/,
    );
  });

  it('ignores a stray forge-home.json: no user-facing override exists (d-0170)', () => {
    const base = mkdtempSync(join(tmpdir(), 'forge-stray-'));
    try {
      const roaming = join(base, 'AppData', 'Roaming');
      const env = { APPDATA: roaming, LOCALAPPDATA: join(base, 'Local') };
      const host = { platform: process.platform, homedir: base };
      const expected = loadDataHome(env, host).home;
      mkdirSync(join(roaming, 'Forge'), { recursive: true });
      writeFileSync(
        join(roaming, 'Forge', 'forge-home.json'),
        JSON.stringify({ dataHome: 'D:\\ForgeData' }),
      );

      const layout = loadDataHome(env, host);

      expect(layout.home).toBe(expected);
      expect(layout.home).not.toContain('ForgeData');
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
