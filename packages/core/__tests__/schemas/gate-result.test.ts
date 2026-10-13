/**
 * Tests for the gate result schema.
 *
 * Why: Gate verdicts are what lets a ticket reach Review or merge. A row naming a gate that does not exist, or a status outside the closed set, must be rejected instead of read as a pass (verification-plane.md).
 *
 * Pins: GateResult parses G1-G6 and BR and rejects unknown gates and statuses; NewGateResult has no id.
 * Depends on: src/schemas/gate-result, vitest.
 */

import { describe, expect, it } from 'vitest';
import { GateResult, NewGateResult } from '#/schemas/gate-result.js';

const ts = '2026-10-13T00:00:00.000Z';

describe('GateResult', () => {
  const gate = { id: 1, run_id: 'r1', gate: 'G1', status: 'passed', started_at: ts };

  it('parses G1..G6 and BR, with optional report_ref and ended_at', () => {
    for (const g of ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'BR']) {
      expect(GateResult.safeParse({ ...gate, gate: g }).success).toBe(true);
    }

    expect(GateResult.safeParse({ ...gate, report_ref: 'x', ended_at: ts }).success).toBe(
      true,
    );
  });

  it('carries the judged head sha when given and rejects an empty one', () => {
    expect(GateResult.parse({ ...gate, head_sha: 'abc123' }).head_sha).toBe('abc123');
    expect(GateResult.parse(gate).head_sha).toBeUndefined();
    expect(GateResult.safeParse({ ...gate, head_sha: '' }).success).toBe(false);
  });

  it('rejects an unknown gate or status', () => {
    expect(GateResult.safeParse({ ...gate, gate: 'G7' }).success).toBe(false);
    expect(GateResult.safeParse({ ...gate, status: 'meh' }).success).toBe(false);
  });

  it('NewGateResult has no id', () => {
    expect(Object.keys(NewGateResult.shape)).not.toContain('id');
  });
});
