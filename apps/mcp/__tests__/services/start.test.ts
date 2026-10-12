/**
 * Pins the startup contract of the `forge-mcp` process.
 *
 * Why: the driver relies on a non-zero exit to learn the MCP server refused to start,
 *   and a Worker must never reach tools through a server whose token did not match its
 *   run. These tests run the real startup path against a temporary SQLite database with
 *   the process effects stubbed.
 *
 * Pins: start(), parseEnv(), depsFromEnv(), createSqliteTokenStore().
 * Depends on: services/start, @forge/db, @forge/mcp, node:fs.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStorageOnDriver, openSqliteDriver, runMigrations } from '@forge/db';
import type { SqlDriver } from '@forge/db';
import { hashToken } from '@forge/mcp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { depsFromEnv, parseEnv, start } from '#/services/start.js';

const RUN_ID = 'run-1';
const TOKEN = 'secret-token';
let dir: string;
let dbPath: string;
let driver: SqlDriver;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'forge-mcp-'));
  dbPath = join(dir, 'db.sqlite');
  driver = openSqliteDriver(dbPath);
  runMigrations(driver);
  await createStorageOnDriver(driver).transaction((tx) =>
    tx.runs.insert({
      id: RUN_ID,
      ticket_id: 'SF-1',
      harness: 'fake',
      driver_version: '0',
      cwd: '/tmp',
      lane: 'express',
      started_at: '2026-10-13T00:00:00.000Z',
      status: 'running',
    }),
  );
  driver.exec(
    'CREATE TABLE run_tokens (run_id TEXT PRIMARY KEY, token_sha256 TEXT NOT NULL)',
  );
  driver.run('INSERT INTO run_tokens VALUES (?, ?)', [RUN_ID, hashToken(TOKEN)]);
});

afterEach(() => {
  driver.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // start() opens its own connection that stays open for the process lifetime; on Windows
    // that holds the file, and the OS temp cleaner removes it later.
  }
});

const io = () => ({
  exit: vi.fn(),
  stderr: vi.fn(),
  serve: vi.fn(async () => undefined),
});
const env = (over: Record<string, string> = {}) => ({
  FORGE_RUN_ID: RUN_ID,
  FORGE_RUN_TOKEN: TOKEN,
  FORGE_DB_PATH: dbPath,
  ...over,
});

describe('start', () => {
  it('serves the server when the token matches the running run', async () => {
    const x = io();
    await start(env(), x);
    expect(x.serve).toHaveBeenCalledTimes(1);
    expect(x.exit).not.toHaveBeenCalled();
  });

  it('exits 1 without serving when the token does not match', async () => {
    const x = io();
    await start(env({ FORGE_RUN_TOKEN: 'nope' }), x);
    expect(x.exit).toHaveBeenCalledWith(1);
    expect(x.serve).not.toHaveBeenCalled();
    expect(String(x.stderr.mock.calls[0]?.[0])).toMatch(/token/i);
  });

  it('exits 1 when no token table exists (fail closed)', async () => {
    driver.exec('DROP TABLE run_tokens');
    const x = io();
    await start(env(), x);
    expect(x.exit).toHaveBeenCalledWith(1);
    expect(x.serve).not.toHaveBeenCalled();
  });

  it('exits 1 on a missing environment without serving', async () => {
    const x = io();
    await start({}, x);
    expect(x.exit).toHaveBeenCalledWith(1);
    expect(String(x.stderr.mock.calls[0]?.[0])).toMatch(/FORGE_RUN_ID/);
    expect(x.serve).not.toHaveBeenCalled();
  });
});

describe('env parsing', () => {
  it('splits host lists and sets searxng only when given', () => {
    expect(parseEnv(env()).FORGE_RUN_ID).toBe(RUN_ID);
    const d = depsFromEnv(
      env({
        FORGE_SEARXNG_URL: 'http://localhost:8888',
        FORGE_SEARXNG_ALLOW_HOSTS: 'a.lan, b.lan',
        FORGE_FETCH_ALLOW_HOSTS: 'docs.example.org',
      }),
    );
    expect(d.searxng).toEqual({
      baseUrl: 'http://localhost:8888',
      allowHosts: ['a.lan', 'b.lan'],
    });
    expect(d.fetchAllowHosts).toEqual(['docs.example.org']);
    expect(depsFromEnv(env()).searxng).toBeUndefined();
  });
});
