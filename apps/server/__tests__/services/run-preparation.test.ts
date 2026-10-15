/**
 * Run preparation: `prepareRun`.
 *
 * Why: a run starts correctly only if the harness is told exactly this run's id, token and
 *   database path for its MCP server and the server's URL for its hook, the run directory
 *   exists outside the worktree, and the token is registered with the credential registry
 *   the hook route reads. A request without a token must be refused, not given an empty one.
 *   A resumed run (generation 2 or more, after a restart, d-0092) is registered under a new
 *   secret and its receipt chain gets the `resumed` link first, so G1 can verify each
 *   generation with its own secret (d-0100); a first start writes no link.
 *
 * Pins: a build check that throws refuses the start before a directory or secret exists; run directory, MCP entry env, hook URL and token, registration, missing token refused,
 *   the resumed link and the second secret on a resume, the new URL and token on a resume.
 * Depends on: src/services/prepare-run, @forge/hooks (registry), @forge/db (memory receipts).
 *   IO: temp directory.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessChangedError, InvalidInputError } from '@forge/core';
import type { RunRequest } from '@forge/core';
import { createMemoryReceiptLog } from '@forge/db';
import { createRunSecretRegistry } from '@forge/hooks';
import { createMemorySecretStore } from '@forge/secrets';
import { verifyGenerations } from '@forge/tools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPrepareRun } from '#/services/prepare-run.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'forge-prep-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('createPrepareRun', () => {
  const request = (env: Record<string, string>): RunRequest => ({
    runId: 'run-9',
    projectId: 'fixture',
    lane: 'express',
    promptHash: 'a'.repeat(64),
    mcpIdentity: 'forge',
    ticketId: 'FX-1',
    cwd: dir,
    prompt: 'do it',
    model: 'sonnet',
    budget: { maxTurns: 5, maxUsd: 1, stallMs: 1000, turnMs: 1000 },
    env,
    isolation: 'host',
  });

  const make = (url = 'http://127.0.0.1:4310') => {
    const secrets = createMemorySecretStore();
    const registry = createRunSecretRegistry({ store: secrets });
    const receipts = createMemoryReceiptLog();
    const prepare = createPrepareRun({
      runsDir: join(dir, 'runs'),
      dbPath: join(dir, 'forge.db'),
      mcpEntry: join(dir, 'mcp.js'),
      nodePath: 'node',
      registry,
      receipts,
      now: () => Date.parse('2026-10-14T00:00:00.000Z'),
      hookBaseUrl: () => url,
    });

    return { registry, receipts, secrets, prepare };
  };

  it('creates the run directory, registers the token and describes the MCP server', async () => {
    const { registry, prepare } = make();
    const prepared = await prepare(
      request({ FORGE_RUN_TOKEN: 'tok-1', FORGE_TICKET: 'FX-1' }),
    );

    expect(existsSync(prepared.runDir)).toBe(true);
    expect(prepared.runDir).toBe(join(dir, 'runs', 'run-9'));
    expect(prepared.hookServerUrl).toBe('http://127.0.0.1:4310');
    expect(prepared.hookToken).toBe('tok-1');
    expect(prepared.mcpServers).toEqual([
      {
        name: 'forge',
        command: 'node',
        args: [join(dir, 'mcp.js')],
        env: {
          FORGE_RUN_ID: 'run-9',
          FORGE_RUN_TOKEN: 'tok-1',
          FORGE_DB_PATH: join(dir, 'forge.db'),
        },
      },
    ]);

    expect((await registry.credentials('run-9'))?.token).toBe('tok-1');
  });

  it('refuses the start before creating anything when the build check throws', async () => {
    const secrets = createMemorySecretStore();
    const registry = createRunSecretRegistry({ store: secrets });
    const prepare = createPrepareRun({
      runsDir: join(dir, 'runs'),
      dbPath: join(dir, 'forge.db'),
      mcpEntry: join(dir, 'mcp.js'),
      nodePath: 'node',
      registry,
      receipts: createMemoryReceiptLog(),
      hookBaseUrl: () => 'http://127.0.0.1:4310',
      checkBuild: async () => {
        throw new HarnessChangedError('1.0.0', '1.1.0');
      },
    });

    await expect(prepare(request({ FORGE_RUN_TOKEN: 'tok-1' }))).rejects.toBeInstanceOf(
      HarnessChangedError,
    );

    expect(existsSync(join(dir, 'runs', 'run-9'))).toBe(false);
    expect(await secrets.list('run/')).toEqual([]);
  });

  it('refuses a request without the run token', async () => {
    const { prepare } = make();

    await expect(prepare(request({}))).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('stores the first generation secret and writes no resumed link on a first start', async () => {
    const { registry, receipts, secrets, prepare } = make();
    await prepare(request({ FORGE_RUN_TOKEN: 'tok-1' }));

    expect(await secrets.list('run/')).toEqual(['run/run-9/secret-g1']);
    expect((await registry.credentials('run-9'))?.generation).toBe(1);
    expect(await receipts.list('run-9')).toEqual([]);
  });

  it('on a resume registers generation 2 with the new token and links the chain', async () => {
    const { registry, receipts, secrets, prepare } = make();
    await prepare(request({ FORGE_RUN_TOKEN: 'tok-1' }));
    const second = await prepare({
      ...request({ FORGE_RUN_TOKEN: 'tok-2' }),
      generation: 2,
      resume: 'sess-1',
    });

    expect(second.hookToken).toBe('tok-2');
    expect(await secrets.list('run/')).toEqual([
      'run/run-9/secret-g1',
      'run/run-9/secret-g2',
    ]);

    expect(await registry.credentials('run-9')).toMatchObject({
      token: 'tok-2',
      generation: 2,
    });

    const chain = await receipts.list('run-9');
    expect(chain).toEqual([
      expect.objectContaining({
        kind: 'resumed',
        run_id: 'run-9',
        generation: 2,
        ts: '2026-10-14T00:00:00.000Z',
      }),
    ]);

    expect(verifyGenerations(chain, () => null)).toMatchObject({
      ok: false,
      error: { reason: 'missing_secret' },
    });

    const secret2 = await registry.secret('run-9', 2);
    expect(secret2).not.toBeNull();
    expect(verifyGenerations(chain, (g) => (g === 2 ? (secret2 ?? null) : null))).toEqual(
      { ok: true, value: { receipts: 1, generations: 2 } },
    );
  });

  it('hands a resume the server URL of the moment (the port may differ after a restart)', async () => {
    const { prepare } = make('http://127.0.0.1:5555');
    const prepared = await prepare({
      ...request({ FORGE_RUN_TOKEN: 'tok-2' }),
      generation: 2,
      resume: 'sess-1',
    });

    expect(prepared.hookServerUrl).toBe('http://127.0.0.1:5555');
  });

  it('refuses a generation that was already registered', async () => {
    const { prepare } = make();
    await prepare(request({ FORGE_RUN_TOKEN: 'tok-1' }));

    await expect(prepare(request({ FORGE_RUN_TOKEN: 'tok-1b' }))).rejects.toBeInstanceOf(
      InvalidInputError,
    );
  });
});
