/**
 * Pins the startup contract of the `forge-mcp` process.
 *
 * Why: the driver relies on a non-zero exit to learn the MCP server refused to start,
 *   and a Worker must never reach tools through a server whose token did not match its
 *   run. These tests run the real startup path against a temporary SQLite database with
 *   the process effects stubbed, with the run's token registered the way the driver does
 *   it (hash only, through storage). A missing, revoked or wrong token must all fail
 *   closed, and opening the database must create the token table itself so a fresh
 *   install cannot start unauthenticated.
 *
 * Pins: start(), parseEnv(), depsFromEnv().
 * Depends on: services/start, @forge/db, @forge/mcp, node:fs.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteStorage, openSqliteDriver } from '@forge/db';
import type { StorageAdapter } from '@forge/core';
import { hashToken } from '@forge/mcp';
import type { ForgeMcpDeps } from '@forge/mcp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { depsFromEnv, parseEnv, start } from '#/services/start.js';

const RUN_ID = 'run-1';
const TOKEN = 'secret-token';
const T0 = '2026-10-13T00:00:00.000Z';
let dir: string;
let dbPath: string;
let seed: StorageAdapter;
/** Databases `start()` opened; closed after each test so the temp directory can go. */
const opened: StorageAdapter[] = [];
const track = (e: Record<string, string | undefined>): ForgeMcpDeps => {
  const deps = depsFromEnv(e);
  opened.push(deps.storage);

  return deps;
};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'forge-mcp-'));
  dbPath = join(dir, 'db.sqlite');
  seed = createSqliteStorage(dbPath);
  await seed.transaction(async (tx) => {
    await tx.runs.insert({
      id: RUN_ID,
      ticket_id: 'SF-1',
      harness: 'fake',
      driver_version: '0',
      cwd: '/tmp',
      lane: 'express',
      started_at: T0,
      status: 'running',
      owner: 'server-1',
    });

    await tx.runTokens.put(RUN_ID, hashToken(TOKEN), T0);
  });
});

afterEach(async () => {
  await Promise.all(opened.splice(0).map((s) => s.close()));
  await seed.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
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
  it('serves the server when the registered token matches the running run', async () => {
    const x = io();
    await start(env(), x, track);
    expect(x.serve).toHaveBeenCalledTimes(1);
    expect(x.exit).not.toHaveBeenCalled();
  });

  it('exits 1 without serving when the token does not match', async () => {
    const x = io();
    await start(env({ FORGE_RUN_TOKEN: 'nope' }), x, track);
    expect(x.exit).toHaveBeenCalledWith(1);
    expect(x.serve).not.toHaveBeenCalled();
    expect(String(x.stderr.mock.calls[0]?.[0])).toMatch(/token/i);
  });

  it('exits 1 when the token was revoked', async () => {
    await seed.transaction((tx) => tx.runTokens.revoke(RUN_ID, T0));
    const x = io();
    await start(env(), x, track);
    expect(x.exit).toHaveBeenCalledWith(1);
    expect(x.serve).not.toHaveBeenCalled();
  });

  it('exits 1 when no token was ever registered for the run', async () => {
    await seed.transaction((tx) =>
      tx.runs.insert({
        id: 'run-2',
        ticket_id: 'SF-1',
        harness: 'fake',
        driver_version: '0',
        cwd: '/tmp',
        lane: 'express',
        started_at: T0,
        status: 'running',
        owner: 'server-1',
      }),
    );

    const x = io();
    await start(env({ FORGE_RUN_ID: 'run-2' }), x, track);
    expect(x.exit).toHaveBeenCalledWith(1);
    expect(x.serve).not.toHaveBeenCalled();
  });

  it('refuses a missing database file without creating it', async () => {
    const x = io();
    const missing = join(dir, 'fresh.sqlite');
    await start(env({ FORGE_DB_PATH: missing }), x, track);
    expect(x.exit).toHaveBeenCalledWith(1);
    expect(x.serve).not.toHaveBeenCalled();
    expect(String(x.stderr.mock.calls[0]?.[0])).toMatch(/not found|does not exist/i);
    expect(existsSync(missing)).toBe(false);
  });

  it('refuses an existing database that has no schema and does not migrate it', async () => {
    const bare = join(dir, 'bare.sqlite');
    openSqliteDriver(bare).close();
    const x = io();
    await start(env({ FORGE_DB_PATH: bare }), x, track);
    expect(x.exit).toHaveBeenCalledWith(1);
    expect(x.serve).not.toHaveBeenCalled();
    expect(String(x.stderr.mock.calls[0]?.[0])).toMatch(/schema|migrat/i);
    const d = openSqliteDriver(bare);
    expect(
      d.all("SELECT name FROM sqlite_master WHERE name = 'schema_migrations'"),
    ).toHaveLength(0);

    d.close();
  });

  it('refuses a database whose schema is behind the registry', async () => {
    const d = openSqliteDriver(dbPath);
    d.run(
      'DELETE FROM schema_migrations WHERE id = (SELECT MAX(id) FROM schema_migrations)',
    );

    d.close();
    const x = io();
    await start(env(), x, track);
    expect(x.exit).toHaveBeenCalledWith(1);
    expect(x.serve).not.toHaveBeenCalled();
    expect(String(x.stderr.mock.calls[0]?.[0])).toMatch(/behind|migrat/i);
  });

  it('exits 1 on a missing environment without serving', async () => {
    const x = io();
    await start({}, x, track);
    expect(x.exit).toHaveBeenCalledWith(1);
    expect(String(x.stderr.mock.calls[0]?.[0])).toMatch(/FORGE_RUN_ID/);
    expect(x.serve).not.toHaveBeenCalled();
  });
});

describe('env parsing', () => {
  it('splits host lists and sets searxng only when given', () => {
    expect(parseEnv(env()).FORGE_RUN_ID).toBe(RUN_ID);
    const d = track(
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
    expect(track(env()).searxng).toBeUndefined();
  });

  it('wires the production network ports here, not in the library domain', () => {
    const d = track(env());
    expect(typeof d.resolve).toBe('function');
    expect(typeof d.transport).toBe('function');
    expect(typeof d.searchFetch).toBe('function');
  });
});
