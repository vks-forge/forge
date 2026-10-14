/**
 * Tests for finding the data home on a machine.
 *
 * Why: the data home decides where the database and the encrypted secrets are. A server and
 *   a CLI that read different folders would look at two separate, silently empty homes, and a
 *   hand-edited bootstrap file must stop startup with a message instead of being ignored.
 *   The machine is a literal here, so no test touches the real `%LOCALAPPDATA%` or the real
 *   config directory.
 *
 * Pins: default location, FORGE_HOME precedence (the bootstrap file is not even read), the
 *   bootstrap file being honoured, a malformed file failing loudly, a missing file ignored.
 * Depends on: src/config/data-home. No IO.
 */

import { InvalidInputError } from '@forge/core';
import { describe, expect, it, vi } from 'vitest';
import { loadDataHome } from '#/config/data-home.js';
import type { DataHomeIo } from '#/types/data-home.types.js';

const BOOTSTRAP = 'C:\\Users\\Ana\\AppData\\Roaming\\Forge\\forge-home.json';

const machine = (files: Record<string, string> = {}): DataHomeIo => ({
  platform: 'win32',
  homedir: 'C:\\Users\\Ana',
  readText: vi.fn(async (path: string) => files[path]),
});

describe('loadDataHome', () => {
  it('defaults to %LOCALAPPDATA%\\Forge', async () => {
    const env = { LOCALAPPDATA: 'C:\\Users\\Ana\\AppData\\Local' };

    const layout = await loadDataHome(env, machine());

    expect(layout.home).toBe('C:\\Users\\Ana\\AppData\\Local\\Forge');
    expect(layout.dbPath).toBe('C:\\Users\\Ana\\AppData\\Local\\Forge\\forge.db');
  });

  it('honours the folder named in forge-home.json', async () => {
    const io = machine({ [BOOTSTRAP]: '{"dataHome":"D:\\\\ForgeData"}' });

    const layout = await loadDataHome({}, io);

    expect(layout.home).toBe('D:\\ForgeData');
    expect(layout.secretsDir).toBe('D:\\ForgeData\\secrets');
  });

  it('lets FORGE_HOME win and does not read the bootstrap file at all', async () => {
    const io = machine({ [BOOTSTRAP]: '{"dataHome":"D:\\\\ForgeData"}' });

    const layout = await loadDataHome({ FORGE_HOME: 'E:\\dev-home' }, io);

    expect(layout.home).toBe('E:\\dev-home');
    expect(io.readText).not.toHaveBeenCalled();
  });

  it('treats a missing bootstrap file as no choice', async () => {
    const layout = await loadDataHome({}, machine());

    expect(layout.home).toBe('C:\\Users\\Ana\\AppData\\Local\\Forge');
  });

  it.each(['{', '{"dataHome":"relative"}', '{"other":1}'])(
    'stops startup on a bad bootstrap file %j',
    async (text) => {
      const io = machine({ [BOOTSTRAP]: text });

      await expect(loadDataHome({}, io)).rejects.toBeInstanceOf(InvalidInputError);
    },
  );

  it('rejects a relative FORGE_HOME', async () => {
    await expect(loadDataHome({ FORGE_HOME: 'here' }, machine())).rejects.toThrow(
      /FORGE_HOME must be an absolute path/,
    );
  });
});
