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
 *   (execution-plane.md §3, §8).
 * Depends on: src/schemas/run, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  DriverCapabilities,
  ErrorFamily,
  Run,
  RunEvent,
  InteractionKind,
  RunRequest,
  RunResult,
  RunStatus,
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
    for (const e of events) expect(RunEvent.safeParse(e).success).toBe(true);
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
    ])
      expect(Sha256Hex.safeParse(bad).success).toBe(false);
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
const usage = { in: 1, out: 1, cachedIn: 0, cacheWrite: 0 };
const baseRun = {
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

describe('run lifecycle (batch C item 2)', () => {
  it('RunStatus has starting, settling and settled next to the terminal values', () => {
    for (const s of [
      'starting',
      'running',
      'settling',
      'settled',
      'success',
      'cancelled',
    ])
      expect(RunStatus.safeParse(s).success).toBe(true);
  });

  it('Run requires an owner and carries the optional lifecycle columns', () => {
    expect(Run.safeParse({ ...baseRun, owner: undefined }).success).toBe(false);
    const full = {
      ...baseRun,
      pid: 4242,
      last_event_at: ts,
      final_chain_hash: 'b'.repeat(64),
      catalogue_hash: 'c'.repeat(64),
      prompt_hash: 'd'.repeat(64),
      retry_of: 'r0',
      hook_registered_at: ts,
    };
    expect(Run.parse(full)).toEqual(full);
    expect(Run.safeParse({ ...baseRun, pid: -1 }).success).toBe(false);
    expect(Run.safeParse({ ...baseRun, prompt_hash: 'nope' }).success).toBe(false);
  });
});

describe('RunResult paused (batch C item 6)', () => {
  const paused = {
    status: 'paused',
    session: 's1',
    usage,
    costUsd: null,
    filesTouched: [],
    pauseReason: 'interaction',
    interactionId: 'int-1',
  };

  it('parses a paused result that names its interaction', () => {
    expect(RunResult.safeParse(paused).success).toBe(true);
  });

  it('refuses paused without a reason or interaction, and a pause field on any other status', () => {
    expect(RunResult.safeParse({ ...paused, pauseReason: undefined }).success).toBe(
      false,
    );
    expect(RunResult.safeParse({ ...paused, interactionId: undefined }).success).toBe(
      false,
    );
    expect(RunResult.safeParse({ ...paused, status: 'success' }).success).toBe(false);
  });
});

describe('RunEvent kinds (batch C item 7)', () => {
  it('parses permission, inbox_delivered, session and hook_liveness', () => {
    const events = [
      { type: 'permission', seq: 0, ts, call_id: 'c1', tool: 'shell', decision: 'ask' },
      {
        type: 'permission',
        seq: 1,
        ts,
        interaction_id: 'i1',
        call_id: 'c1',
        tool: 'shell',
        decision: 'allow',
      },
      { type: 'inbox_delivered', seq: 2, ts, inbox_seq: 0, mode: 'steer' },
      { type: 'session', seq: 3, ts, session_ref: 'sess-1' },
      { type: 'hook_liveness', seq: 4, ts, fingerprint: 'f'.repeat(16) },
    ];
    for (const e of events) expect(RunEvent.safeParse(e).success).toBe(true);
  });

  it('rejects malformed new events', () => {
    expect(
      RunEvent.safeParse({
        type: 'permission',
        seq: 0,
        ts,
        call_id: 'c',
        tool: 't',
        decision: 'maybe',
      }).success,
    ).toBe(false);
    expect(
      RunEvent.safeParse({
        type: 'inbox_delivered',
        seq: 0,
        ts,
        inbox_seq: 0,
        mode: 'shout',
      }).success,
    ).toBe(false);
    expect(
      RunEvent.safeParse({ type: 'session', seq: 0, ts, session_ref: '' }).success,
    ).toBe(false);
  });

  it('InteractionKind gains blocked, and the ask event carries it', () => {
    expect(InteractionKind.safeParse('blocked').success).toBe(true);
    const ask = {
      type: 'ask',
      seq: 0,
      ts,
      interaction_id: 'i',
      kind: 'blocked',
      prompt: 'x',
    };
    expect(RunEvent.safeParse(ask).success).toBe(true);
  });
});

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

  it.each(['runId', 'projectId', 'lane', 'promptHash', 'mcpIdentity'])(
    'requires %s',
    (key) => {
      const rest = Object.fromEntries(Object.entries(request).filter(([k]) => k !== key));
      expect(RunRequest.safeParse(rest).success).toBe(false);
    },
  );
});
