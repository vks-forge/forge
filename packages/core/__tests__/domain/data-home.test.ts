/**
 * Tests for the data-home resolver.
 *
 * Why: the database, secrets, runs and Worker worktrees all hang off one folder, and the
 *   Worker-facing floors deny that folder by absolute path. If the server and the CLI ever
 *   resolved it differently, secrets would be written where the server does not look, or
 *   the floors would guard the wrong folder (d-0098). One pure resolver is pinned here for
 *   every platform, the override order, and the fail-closed rejection of relative paths.
 *
 * Pins: per-platform defaults, FORGE_HOME over bootstrap file over default, the bootstrap
 *   file location and grammar, layout members, rejection of relative or empty homes.
 * Depends on: src/domain/data-home, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  bootstrapFilePath,
  dataHomeLayout,
  parseBootstrapFile,
  resolveDataHome,
} from '#/domain/data-home.js';

const win = { platform: 'win32', homedir: 'C:\\Users\\Ana' } as const;
const mac = { platform: 'darwin', homedir: '/Users/ana' } as const;
const lin = { platform: 'linux', homedir: '/home/ana' } as const;

describe('resolveDataHome defaults', () => {
  it('uses %LOCALAPPDATA%\\Forge on Windows', () => {
    const env = { LOCALAPPDATA: 'C:\\Users\\Ana\\AppData\\Local' };

    expect(resolveDataHome({ ...win, env })).toBe(
      'C:\\Users\\Ana\\AppData\\Local\\Forge',
    );
  });

  it('falls back to <home>\\AppData\\Local\\Forge when LOCALAPPDATA is unset', () => {
    expect(resolveDataHome({ ...win, env: {} })).toBe(
      'C:\\Users\\Ana\\AppData\\Local\\Forge',
    );
  });

  it('uses ~/Library/Application Support/Forge on macOS', () => {
    expect(resolveDataHome({ ...mac, env: {} })).toBe(
      '/Users/ana/Library/Application Support/Forge',
    );
  });

  it('uses $XDG_DATA_HOME/forge on Linux, else ~/.local/share/forge', () => {
    expect(resolveDataHome({ ...lin, env: { XDG_DATA_HOME: '/data/xdg' } })).toBe(
      '/data/xdg/forge',
    );

    expect(resolveDataHome({ ...lin, env: {} })).toBe('/home/ana/.local/share/forge');
  });

  it('ignores a relative XDG_DATA_HOME, as the XDG spec says', () => {
    expect(resolveDataHome({ ...lin, env: { XDG_DATA_HOME: 'rel' } })).toBe(
      '/home/ana/.local/share/forge',
    );
  });
});

describe('resolveDataHome overrides', () => {
  it('prefers FORGE_HOME over the bootstrap choice and the default', () => {
    const home = resolveDataHome({
      ...lin,
      env: { FORGE_HOME: '/tmp/dev-home' },
      bootstrapHome: '/mnt/big/forge',
    });

    expect(home).toBe('/tmp/dev-home');
  });

  it('uses the bootstrap choice over the default', () => {
    expect(resolveDataHome({ ...lin, env: {}, bootstrapHome: '/mnt/big/forge' })).toBe(
      '/mnt/big/forge',
    );
  });

  it('rejects a relative FORGE_HOME instead of resolving it against the cwd', () => {
    expect(() => resolveDataHome({ ...lin, env: { FORGE_HOME: 'here' } })).toThrow(
      /absolute/,
    );
  });

  it('rejects a relative bootstrap choice', () => {
    expect(() => resolveDataHome({ ...win, env: {}, bootstrapHome: 'D:forge' })).toThrow(
      /absolute/,
    );
  });

  it('treats an empty FORGE_HOME as unset', () => {
    expect(resolveDataHome({ ...lin, env: { FORGE_HOME: '' } })).toBe(
      '/home/ana/.local/share/forge',
    );
  });
});

describe('bootstrapFilePath', () => {
  it('lives in the platform config dir', () => {
    expect(
      bootstrapFilePath({ ...win, env: { APPDATA: 'C:\\Users\\Ana\\AppData\\Roaming' } }),
    ).toBe('C:\\Users\\Ana\\AppData\\Roaming\\Forge\\forge-home.json');

    expect(bootstrapFilePath({ ...mac, env: {} })).toBe(
      '/Users/ana/Library/Application Support/Forge/forge-home.json',
    );

    expect(bootstrapFilePath({ ...lin, env: {} })).toBe(
      '/home/ana/.config/forge/forge-home.json',
    );

    expect(bootstrapFilePath({ ...lin, env: { XDG_CONFIG_HOME: '/cfg' } })).toBe(
      '/cfg/forge/forge-home.json',
    );
  });
});

describe('parseBootstrapFile', () => {
  it('reads the chosen folder', () => {
    expect(parseBootstrapFile('{"dataHome":"D:\\\\ForgeData"}', 'win32')).toBe(
      'D:\\ForgeData',
    );
  });

  it('rejects malformed json, a missing key and a relative path with a typed error', () => {
    for (const text of ['{', '{}', '{"dataHome":"rel"}', '{"dataHome":""}', '[]']) {
      expect(() => parseBootstrapFile(text, 'linux')).toThrow(/forge-home/);
    }
  });
});

describe('dataHomeLayout', () => {
  it('names every member under the home with the platform separator', () => {
    const l = dataHomeLayout('C:\\Forge', 'win32');

    expect(l).toEqual({
      home: 'C:\\Forge',
      dbPath: 'C:\\Forge\\forge.db',
      secretsDir: 'C:\\Forge\\secrets',
      memoryDir: 'C:\\Forge\\memory',
      worktreesDir: 'C:\\Forge\\worktrees',
      runsDir: 'C:\\Forge\\runs',
      backupsDir: 'C:\\Forge\\backups',
      logsDir: 'C:\\Forge\\logs',
      serverJsonPath: 'C:\\Forge\\server.json',
      installTokenPath: 'C:\\Forge\\install-token',
      serverLockPath: 'C:\\Forge\\server.lock',
    });
  });

  it('works for posix homes', () => {
    expect(dataHomeLayout('/h/forge', 'linux').runsDir).toBe('/h/forge/runs');
  });
});
