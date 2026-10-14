/**
 * Tests for the run lifecycle schemas: Run rows and paused results.
 *
 * Why: a run row is the Director's record of one Worker attempt and a paused result is how
 *   a Worker waiting on a human leaves the run without being counted as a failure. If a
 *   malformed row parsed, or a paused result lost its interaction, the Director would
 *   retry a Worker that is waiting for an answer.
 *
 * Pins: Run lifecycle fields (batch C item 2) and RunResult paused (batch C item 6).
 * Depends on: src/schemas/run, vitest.
 */

import { describe, expect, it } from 'vitest';
import { Run, RunResult, RunStatus } from '#/schemas/run.js';

const ts = '2026-10-13T00:00:00.000Z';

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
    ]) {
      expect(RunStatus.safeParse(s).success).toBe(true);
    }
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
      config_version: 'c3:p1',
      retry_of: 'r0',
      hook_registered_at: ts,
    };

    expect(Run.parse(full)).toEqual(full);
    expect(Run.safeParse({ ...baseRun, pid: -1 }).success).toBe(false);
    expect(Run.safeParse({ ...baseRun, prompt_hash: 'nope' }).success).toBe(false);
    expect(Run.safeParse({ ...baseRun, config_version: 'v3' }).success).toBe(false);
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
