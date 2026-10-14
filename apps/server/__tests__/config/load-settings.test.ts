/**
 * Loading settings: environment parsing and the file layout.
 *
 * Why: a bad config must stop the server at startup with a message that names the file or
 *   variable, not surface as a Worker or gate failing mid-ticket. The server no longer reads
 *   forge.yaml or project.yaml here (settings live in the database); a test pins that a root
 *   with no yaml files still loads. Empty environment values
 *   must count as unset (a shell exporting `FORGE_PORT=` must not mean port 0), the layout
 *   must put runtime data in the data home (never the checkout), and a project config path
 *   must be honoured.
 *
 * Pins: defaults, blank-is-unset, bad port/engine rejected, no yaml needed,
 *   layout paths (config in the checkout, data in the data home), harness env passthrough, dev catalogue key gating.
 * Depends on: src/config/load-settings, src/config/paths. IO: an empty temp directory.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InvalidInputError, dataHomeLayout } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveEntrypoints } from '#/config/entrypoints.js';
import { resolveLayout } from '#/config/paths.js';
import { loadSettings, readServerEnv } from '#/config/load-settings.js';
import type { DataHomeIo } from '#/types/data-home.types.js';

let root: string;

/** A Windows machine with no bootstrap file, so no test reads the real %LOCALAPPDATA% or config dir. */
const machine = (files: Record<string, string> = {}): DataHomeIo => ({
  platform: 'win32',
  homedir: 'C:\\Users\\Ana',
  readText: async (path) => files[path],
});

const load = (
  env: Record<string, string | undefined>,
  cwd: string,
  io: DataHomeIo = machine(),
) => loadSettings(env, cwd, io);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'forge-settings-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('readServerEnv', () => {
  it('fills defaults', () => {
    const env = readServerEnv({});

    expect(env.FORGE_HOST).toBe('127.0.0.1');
    expect(env.FORGE_PORT).toBe(4310);
    expect(env.FORGE_ENGINE).toBe('acp');
    expect(env.FORGE_SHUTDOWN_GRACE_MS).toBe(30_000);
  });

  it('treats empty strings as unset', () => {
    const env = readServerEnv({ FORGE_PORT: '', FORGE_HOST: '', FORGE_ROOT: '' });

    expect(env.FORGE_PORT).toBe(4310);
    expect(env.FORGE_HOST).toBe('127.0.0.1');
    expect(env.FORGE_ROOT).toBeUndefined();
  });

  it('accepts port 0 for an ephemeral port', () => {
    expect(readServerEnv({ FORGE_PORT: '0' }).FORGE_PORT).toBe(0);
  });

  it.each([
    { FORGE_PORT: 'abc' },
    { FORGE_PORT: '70000' },
    { FORGE_PORT: '-1' },
    { FORGE_ENGINE: 'gpt' },
  ])('rejects %j naming the variable', (bad) => {
    expect(() => readServerEnv(bad)).toThrow(InvalidInputError);
    expect(() => readServerEnv(bad)).toThrow(Object.keys(bad)[0] as string);
  });
});

describe('resolveLayout', () => {
  const home = dataHomeLayout('C:\\Forge', 'win32');
  const entry = resolveEntrypoints(import.meta.url);

  it('reads config from the checkout and puts every data path in the data home', () => {
    const layout = resolveLayout(root, home, entry);

    expect(layout.configRoot).toBe(root);
    expect(layout.cataloguePath).toBe(join(root, '.forge', 'tools', 'catalog.yaml'));
    expect(layout.data.dbPath).toBe('C:\\Forge\\forge.db');
    expect(layout.data.runsDir).toBe('C:\\Forge\\runs');
    expect(layout.data.secretsDir).toBe('C:\\Forge\\secrets');
    expect(layout.data.worktreesDir).toBe('C:\\Forge\\worktrees');
  });

  it('never places a data path inside the checkout', () => {
    const layout = resolveLayout(root, home, entry);
    const dataPaths = Object.values(layout.data);

    expect(dataPaths.every((p) => !p.startsWith(root))).toBe(true);
  });

  it('carries the resolved entry points', () => {
    const layout = resolveLayout(root, home, entry);

    expect(layout.mcpEntry).toMatch(/mcp[\\/]dist[\\/]main\.js$/);
    expect(layout.hookJsPath).toMatch(/drivers[\\/]bin[\\/]hook\.js$/);
  });
});

describe('loadSettings', () => {
  it('applies the environment and reads no yaml file', async () => {
    const settings = await load(
      {
        FORGE_ROOT: root,
        FORGE_PORT: '0',
        FORGE_ENGINE: 'cli',
        FORGE_CLAUDE_BINARY: 'claude.exe',
      },
      'ignored-cwd',
    );

    expect(settings.port).toBe(0);
    expect(settings.engine).toBe('cli');
    expect(settings.claudeBinary).toBe('claude.exe');
    expect(settings.harnessEnvPassthrough).toEqual([]);
    expect(settings.allowDevCatalogueKey).toBe(false);
  });

  it('keeps harness env passthrough empty unless named, and splits a list', async () => {
    const named = await load(
      {
        FORGE_ROOT: root,
        FORGE_HARNESS_ENV_PASSTHROUGH: ' ANTHROPIC_API_KEY , ,HTTPS_PROXY',
      },
      'ignored-cwd',
    );

    expect(named.harnessEnvPassthrough).toEqual(['ANTHROPIC_API_KEY', 'HTTPS_PROXY']);
  });

  it('uses the current directory when FORGE_ROOT is unset', async () => {
    const settings = await load({}, root);

    expect(settings.layout.configRoot).toBe(root);
  });

  it('puts the database, runs and secrets in the data home named by FORGE_HOME', async () => {
    const home = join(root, 'forge-home');
    const settings = await load({ FORGE_ROOT: root, FORGE_HOME: home }, 'ignored-cwd');

    expect(settings.layout.data.dbPath).toBe(join(home, 'forge.db'));
    expect(settings.layout.data.runsDir).toBe(join(home, 'runs'));
    expect(settings.layout.data.secretsDir).toBe(join(home, 'secrets'));
  });

  it('defaults the data home to %LOCALAPPDATA%\\Forge on Windows', async () => {
    const env = { LOCALAPPDATA: 'C:\\Users\\Ana\\AppData\\Local' };
    const settings = await load(env, root);

    expect(settings.layout.data.home).toBe('C:\\Users\\Ana\\AppData\\Local\\Forge');
  });

  it('allows the dev catalogue key only when asked or under test', async () => {
    const asked = await load({ FORGE_ALLOW_DEV_CATALOGUE_KEY: '1' }, root);
    const test = await load({ NODE_ENV: 'test' }, root);

    expect(asked.allowDevCatalogueKey).toBe(true);
    expect(test.allowDevCatalogueKey).toBe(true);
  });
});
