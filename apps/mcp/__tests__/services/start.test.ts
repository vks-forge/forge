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
import {
  createMutex,
  createSqliteConfigSource,
  createSqliteStorage,
  openSqliteDriver,
} from '@forge/db';
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
const track = async (e: Record<string, string | undefined>): Promise<ForgeMcpDeps> => {
  const deps = await depsFromEnv(e);
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
  it('reads the run, token and database from the environment', () => {
    expect(parseEnv(env()).FORGE_RUN_ID).toBe(RUN_ID);
    expect(() => parseEnv({})).toThrow(/FORGE_RUN_ID/);
  });
});

/** Saves a company or project settings version through a second connection, as the server does. */
async function saveSettings(
  scope: 'company' | 'project',
  doc: Record<string, unknown>,
  project = 'sf',
): Promise<void> {
  const driver = openSqliteDriver(dbPath);
  const config = createSqliteConfigSource(driver, createMutex());
  await (scope === 'company'
    ? config.append({ scope, doc, author: 'test', reason: 'test', expectedVersion: 0 })
    : config.append({
        scope,
        project,
        doc,
        author: 'test',
        reason: 'test',
        expectedVersion: 0,
      }));

  driver.close();
}

describe('research from settings (d-0144, code.md rule 9)', () => {
  it('builds the provider from the stored settings with no environment variable', async () => {
    const d = await track(env());

    expect(d.research?.capabilities().provider).toBe('searxng');
    expect(d.researchLimits).toEqual({
      allowHosts: [],
      denyHosts: [],
      timeoutMs: 10_000,
    });
  });

  it('applies the company host lists and timeout', async () => {
    await saveSettings('company', {
      research: {
        fetch: { allow_hosts: ['docs.a.com'], deny_hosts: ['bad.com'], timeout_ms: 5000 },
      },
    });

    const d = await track(env());

    expect(d.researchLimits).toEqual({
      allowHosts: ['docs.a.com'],
      denyHosts: ['bad.com'],
      timeoutMs: 5000,
    });
  });

  it('gives a Worker no web tools when the company sets provider none', async () => {
    await saveSettings('company', { research: { provider: 'none' } });

    expect((await track(env())).research).toBeUndefined();
  });

  it('lets the run project narrow the company settings', async () => {
    await seed.transaction((tx) => tx.runs.update(RUN_ID, { project: 'sf' }));
    await saveSettings('project', { research: { deny_hosts: ['p.com'] } });

    const d = await track(env());

    expect(d.researchLimits?.denyHosts).toEqual(['p.com']);
  });

  it('lets the run project switch research off', async () => {
    await seed.transaction((tx) => tx.runs.update(RUN_ID, { project: 'sf' }));
    await saveSettings('project', { research: { enabled: false } });

    expect((await track(env())).research).toBeUndefined();
  });

  it('lets the old environment variables override the stored settings in development', async () => {
    await saveSettings('company', { research: { provider: 'none' } });

    const d = await track(
      env({
        FORGE_SEARXNG_URL: 'http://localhost:9999',
        FORGE_SEARXNG_ALLOW_HOSTS: 'a.lan, b.lan',
        FORGE_FETCH_ALLOW_HOSTS: 'docs.example.org',
      }),
    );

    expect(d.research?.capabilities().provider).toBe('searxng');
    expect(d.researchLimits?.allowHosts).toEqual(['docs.example.org']);
  });

  it('still serves the tools it can when the stored settings do not load', async () => {
    const driver = openSqliteDriver(dbPath);
    driver.run('DROP TRIGGER IF EXISTS config_versions_no_update');
    driver.run(
      `INSERT INTO config_versions (scope, project, version, doc_json, author, reason, created_at)
       VALUES ('company', NULL, 1, '{"research":{"provider":"carrier-pigeon"}}', 'x', 'x', 1)`,
    );

    driver.close();

    const d = await track(env());

    expect(d.research).toBeUndefined();
    expect(d.storage).toBeDefined();
  });

  it('wires no network port into the MCP server dependencies themselves', async () => {
    const d = await track(env());

    expect(Object.keys(d)).not.toContain('resolve');
    expect(Object.keys(d)).not.toContain('transport');
  });
});
