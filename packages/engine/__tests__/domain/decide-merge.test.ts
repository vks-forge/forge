/**
 * Tests for the merge decision shared by the automatic merge and the owner's approval.
 *
 * Why: CHE-10 reached sign-off after the owner overruled a failed G1, then "Approve and merge"
 *   refused it for good because it read the failed gate row alone. The decision must let an
 *   owner-overruled gate through, name it, and still refuse every other unsafe case: a failed gate
 *   nobody overruled, a gate with no verdict, a failed install, a head the gates never judged.
 *
 * Pins: pass; failed G1 with the owner's override on this run's G1 stage passes and lists G1; the
 *   same without override fails; an override of another run covers nothing; a missing gate fails;
 *   a head mismatch fails; a failed setup row fails without override.
 * Depends on: domain/decide-merge, @forge/core types, vitest.
 */

import type { Gate, GateResult, StageRun } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { decideMerge, describeOverride } from '#/domain/decide-merge.js';

const G1 = { name: 'G1' } as unknown as Gate;
const AT = '2026-01-01T00:00:00.000Z';

const row = (gate: string, status: GateResult['status'], id = 1): GateResult =>
  ({
    id,
    run_id: 'run-1',
    gate,
    status,
    head_sha: 'sha-1',
    started_at: AT,
  }) as GateResult;

const stage = (override: boolean, runId = 'run-1'): StageRun =>
  ({
    id: 7,
    ticket_id: 'CHE-10',
    stage_id: 'g1',
    member_id: '',
    cycle: 0,
    kind: 'script_gate',
    run_id: runId,
    status: 'passed',
    outcome: override
      ? {
          override: {
            by: 'owner',
            action: 'merge_anyway',
            comment: 'scaffold config',
            at: AT,
          },
        }
      : {},
    started_at: AT,
  }) as StageRun;

describe('decideMerge', () => {
  it('passes when every gate passed, with nothing overruled', () => {
    const d = decideMerge({
      rows: [row('G1', 'passed')],
      gates: [G1],
      stages: [],
      runId: 'run-1',
    });

    expect(d).toEqual({ kind: 'pass', overridden: [] });
  });

  it('passes a failed G1 the owner overruled and names it', () => {
    const d = decideMerge({
      rows: [row('G1', 'failed')],
      gates: [G1],
      stages: [stage(true)],
      runId: 'run-1',
    });

    expect(d).toMatchObject({
      kind: 'pass',
      overridden: [{ gate: 'G1', by: 'owner', comment: 'scaffold config' }],
    });

    expect(describeOverride(d)).toContain('G1');
    expect(describeOverride(d)).toContain('scaffold config');
  });

  it('fails a failed G1 with no override', () => {
    const d = decideMerge({
      rows: [row('G1', 'failed')],
      gates: [G1],
      stages: [stage(false)],
      runId: 'run-1',
    });

    expect(d).toEqual({ kind: 'fail', reason: 'gate_failed', gates: ['G1'] });
  });

  it('does not let an override of another run cover this run', () => {
    const d = decideMerge({
      rows: [row('G1', 'failed')],
      gates: [G1],
      stages: [stage(true, 'run-0')],
      runId: 'run-1',
    });

    expect(d.kind).toBe('fail');
  });

  it('fails when a configured gate has no verdict', () => {
    const d = decideMerge({
      rows: [],
      gates: [G1],
      stages: [stage(true)],
      runId: 'run-1',
    });

    expect(d).toEqual({ kind: 'fail', reason: 'gate_missing', gates: ['G1'] });
  });

  it('fails when the PR head is not the commit the gates judged', () => {
    const d = decideMerge({
      rows: [row('G1', 'passed')],
      gates: [G1],
      stages: [],
      runId: 'run-1',
      targetHead: 'sha-2',
    });

    expect(d).toEqual({ kind: 'fail', reason: 'head_moved', gates: [] });
  });

  it('fails a failed setup row without override', () => {
    const d = decideMerge({
      rows: [row('G1', 'passed'), row('setup', 'failed', 2)],
      gates: [G1],
      stages: [],
      runId: 'run-1',
    });

    expect(d).toEqual({ kind: 'fail', reason: 'gate_failed', gates: ['setup'] });
  });

  it('never covers a failed setup with the G1 override', () => {
    const d = decideMerge({
      rows: [row('G1', 'failed'), row('setup', 'failed', 2)],
      gates: [G1],
      stages: [stage(true)],
      runId: 'run-1',
    });

    expect(d).toEqual({ kind: 'fail', reason: 'gate_failed', gates: ['setup'] });
  });
});
