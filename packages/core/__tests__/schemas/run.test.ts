/**
 * Tests for the run schemas.
 *
 * Why: drivers translate into these shapes at the boundary (code.md rule 3).
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
  RunRequest,
  RunResult,
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
      ]),
    );
  });

  it('parses RunRequest and RunResult', () => {
    const req = {
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
