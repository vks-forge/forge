/**
 * Run preparation: `prepareRun`.
 *
 * Why: a run starts correctly only if the harness is told exactly this run's id, token and
 *   database path for its MCP server and the server's URL for its hook, the run directory
 *   exists outside the worktree, and the token is registered with the credential registry
 *   the hook route reads. A request without a token must be refused, not given an empty one.
 *
 * Pins: run directory, MCP entry env, hook URL and token, registration, missing token refused.
 * Depends on: src/services/prepare-run, @forge/hooks (registry). IO: temp directory.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InvalidInputError } from '@forge/core';
import type { RunRequest } from '@forge/core';
import { createRunSecretRegistry } from '@forge/hooks';
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

  const make = () => {
    const registry = createRunSecretRegistry();
    const prepare = createPrepareRun({
      runsDir: join(dir, 'runs'),
      dbPath: join(dir, 'forge.db'),
      mcpEntry: join(dir, 'mcp.js'),
      nodePath: 'node',
      registry,
      hookBaseUrl: () => 'http://127.0.0.1:4310',
    });

    return { registry, prepare };
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

  it('refuses a request without the run token', async () => {
    const { prepare } = make();

    await expect(prepare(request({}))).rejects.toBeInstanceOf(InvalidInputError);
  });
});
