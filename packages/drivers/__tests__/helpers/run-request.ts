/**
 * Builders for valid run requests and prepared-run inputs in driver tests.
 *
 * Why: every driver test starts a run, and `RunRequest` has many required fields (lane,
 *   prompt hash, MCP identity, budget). Building them once keeps the tests about the one
 *   thing each pins, and keeps them honest by parsing through the real core schema.
 *
 * Exports: makeRequest(), makePrepareRun(), tempDir().
 * Depends on: @forge/core (RunRequest), node:fs, node:os, node:path. IO: creates temp dirs.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunRequest } from '@forge/core';
import type { PreparedRun } from '#/types/claude/driver-deps.types.js';

export function tempDir(prefix = 'forge-driver-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function makeRequest(over: Partial<RunRequest> = {}): RunRequest {
  return RunRequest.parse({
    runId: 'run-1',
    projectId: 'proj-1',
    lane: 'standard',
    promptHash: 'a'.repeat(64),
    mcpIdentity: 'forge',
    ticketId: 'FG-1',
    cwd: tempDir('forge-cwd-'),
    prompt: 'do the task',
    model: 'haiku',
    budget: { maxTurns: 5, maxUsd: 0.05, stallMs: 60_000, turnMs: 600_000 },
    env: { FORGE_TICKET: 'FG-1' },
    isolation: 'host',
    ...over,
  });
}

/** A `prepareRun` port writing under `root`, with one stdio MCP server and a hook URL. */
export function makePrepareRun(root: string) {
  return async (req: RunRequest): Promise<PreparedRun> => ({
    runDir: join(root, req.runId),
    mcpServers: [
      { name: 'forge', command: 'node', args: ['mcp.js'], env: { FORGE_RUN_TOKEN: 't' } },
    ],
    env: { FORGE_RUN_ID: req.runId, FORGE_HOOK_CONFIG: '/should/be/stripped' },
    hookServerUrl: 'http://127.0.0.1:9',
    hookToken: 'bearer-token',
  });
}
