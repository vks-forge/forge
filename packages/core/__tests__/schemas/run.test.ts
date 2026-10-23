/**
 * Tests for the run schemas.
 *
 * Why: these schemas are the boundary between untrusted harness output and the Director.
 *   If a malformed event parsed, or an error family went missing, retry and kill
 *   decisions and the run log would act on garbage; pinning every variant stops a driver
 *   or schema change from silently breaking the harness-neutral contract
 *   (execution-plane.md §3, §8).
 *
 * Pins: every normalized RunEvent variant parses and unknown types fail, documented
 *   error families exist, RunRequest/RunResult/Run/DriverCapabilities parse
 *   (execution-plane.md §3, §8). Run lifecycle and newer event kinds are in
 *   run-lifecycle.test.ts and run-events.test.ts.
 * Depends on: src/schemas/run, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  DriverCapabilities,
  ErrorFamily,
  Run,
  RunEvent,
  RunRequest,
  RunResult,
  Sha256Hex,
} from '#/schemas/run.js';

const ts = '2026-10-13T00:00:00.000Z';

describe('run schemas', () => {
  it('parses every normalized RunEvent variant', () => {
    const events = [
      { type: 'tool_call', seq: 1, ts, call_id: 'c1', name: 'Read', input: { p: 1 } },
      { type: 'tool_result', seq: 2, ts, call_id: 'c1', output: 'x', is_error: false },
      { type: 'text', seq: 3, ts, text: 'hello' },
      { type: 'ask', seq: 4, ts, interaction_id: 'i1', kind: 'question', prompt: 'ok?' },
      { type: 'finish', seq: 5, ts, summary: 'done' },
      { type: 'error', seq: 6, ts, family: 'crash', message: 'boom' },
      { type: 'usage', seq: 7, ts, usage: { in: 1, out: 2, cachedIn: 0, cacheWrite: 0 } },
    ];

    for (const e of events) {
      expect(RunEvent.safeParse(e).success).toBe(true);
    }

    expect(RunEvent.safeParse({ type: 'weird', seq: 1, ts }).success).toBe(false);
  });

  it('accepts only lowercase 64-hex SHA-256 digests (run tokens are stored as hashes)', () => {
    expect(Sha256Hex.safeParse('a'.repeat(64)).success).toBe(true);
    for (const bad of [
      '',
      'a'.repeat(63),
      'A'.repeat(64),
      'g'.repeat(64),
      'a'.repeat(65),
    ]) {
      expect(Sha256Hex.safeParse(bad).success).toBe(false);
    }
  });

  it('has the documented error families', () => {
    expect(ErrorFamily.options).toEqual(
      expect.arrayContaining([
        'auth',
        'budget',
        'stall',
        'refusal',
        'crash',
        'policy_denied',
        'unknown',
        'invalid_input',
      ]),
    );
  });

  it('parses RunRequest and RunResult', () => {
    const req = {
      runId: 'run-1',
      projectId: 'SF',
      lane: 'standard',
      promptHash: 'a'.repeat(64),
      mcpIdentity: 'forge',
      ticketId: 'SF-1',
      cwd: 'D:/x',
      prompt: 'p',
      model: 'm',
      permissionPolicy: { allow: ['Read'], deny: [], onUnlisted: 'deny' },
      tools: { mcpServers: [], allow: [], deny: [] },
      budget: { maxTurns: 10, maxUsd: 1, stallMs: 300000, turnMs: 600000 },
      env: {},
      isolation: 'host',
    };

    expect(RunRequest.safeParse(req).success).toBe(true);
    const res = {
      status: 'success',
      session: null,
      usage: { in: 1, out: 1, cachedIn: 0, cacheWrite: 0 },
      costUsd: null,
      filesTouched: [],
    };

    expect(RunResult.safeParse(res).success).toBe(true);
  });

  it('parses Run and DriverCapabilities', () => {
    const run = {
      id: 'r1',
      ticket_id: 'SF-1',
      harness: 'h',
      driver_version: '1',
      cwd: 'x',
      lane: 'express',
      started_at: ts,
      status: 'running',
      owner: 'server-1',
    };

    expect(Run.safeParse(run).success).toBe(true);
    const caps = {
      resume: true,
      steerModes: ['steer'],
      nativeSandbox: false,
      reportsCost: true,
      structuredOutput: false,
      permissionRequests: true,
    };

    expect(DriverCapabilities.safeParse(caps).success).toBe(true);
    expect(
      DriverCapabilities.safeParse({ ...caps, permissionBypass: true }).success,
    ).toBe(true);
  });
});

const request = {
  runId: 'run-1',
  projectId: 'SF',
  lane: 'standard',
  promptHash: 'a'.repeat(64),
  mcpIdentity: 'forge',
  ticketId: 'SF-1',
  cwd: 'D:/x',
  prompt: 'p',
  model: 'm',
  budget: { maxTurns: 10, maxUsd: 1, stallMs: 300000, turnMs: 600000 },
  env: {},
  isolation: 'host',
};

describe('RunRequest (batch C item 9)', () => {
  it('parses without permissionPolicy and tools (derived by the app from visibleTools())', () => {
    expect(RunRequest.safeParse(request).success).toBe(true);
  });

  it('still accepts permissionPolicy and tools when the app supplies them', () => {
    const withBoth = {
      ...request,
      permissionPolicy: { allow: [], deny: [], onUnlisted: 'deny' },
      tools: { mcpServers: ['forge'], allow: [], deny: [] },
    };

    expect(RunRequest.safeParse(withBoth).success).toBe(true);
  });

  it('carries a harness-neutral permissions mode, absent meaning ask', () => {
    expect(RunRequest.parse(request).permissions).toBeUndefined();
    expect(RunRequest.parse({ ...request, permissions: 'bypass' }).permissions).toBe(
      'bypass',
    );

    expect(
      RunRequest.safeParse({ ...request, permissions: 'bypassPermissions' }).success,
    ).toBe(false);
  });

  it.each(['runId', 'projectId', 'lane', 'promptHash', 'mcpIdentity'])(
    'requires %s',
    (key) => {
      const rest = Object.fromEntries(Object.entries(request).filter(([k]) => k !== key));
      expect(RunRequest.safeParse(rest).success).toBe(false);
    },
  );
});
