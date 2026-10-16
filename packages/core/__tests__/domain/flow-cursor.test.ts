/**
 * Tests for the flow cursor.
 *
 * Why: the runner walks a card's flow one step per call and resumes by index after a restart,
 *   so which step comes next must be decided the same way every time: switched-off steps and
 *   steps whose condition says no are skipped, and a condition that cannot be decided runs
 *   the step, because doubt must cost process rather than safety.
 *
 * Pins: skipping disabled steps, lane conditions with a known and an unknown lane,
 *   director_decides with and without an answer, end of flow, and a cursor past the end.
 * Depends on: src/domain/flow-cursor, src/domain/builtin-director, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_DIRECTOR_CONFIG } from '#/domain/builtin-director.js';
import { resolveFlowStep } from '#/domain/flow-cursor.js';
import type { FlowStep } from '#/schemas/director-flow.js';

const flow = BUILTIN_DIRECTOR_CONFIG.flow;
const none = { lane: null, decisions: {} } as const;
const ids = (from: number, ctx: Parameters<typeof resolveFlowStep>[2]): string | null =>
  resolveFlowStep(flow, from, ctx)?.step.id ?? null;

describe('resolveFlowStep', () => {
  it('starts at the first step of the default flow', () => {
    expect(ids(0, none)).toBe('survey');
  });

  it('skips the enhance step for an Express card and runs it for Standard', () => {
    const enhance = flow.findIndex((s) => s.id === 'enhance');

    expect(ids(enhance, { lane: 'express', decisions: {} })).toBe('write_plan');
    expect(ids(enhance, { lane: 'standard', decisions: {} })).toBe('enhance');
  });

  it('runs a lane-conditioned step when the lane is not known yet', () => {
    const enhance = flow.findIndex((s) => s.id === 'enhance');

    expect(ids(enhance, none)).toBe('enhance');
  });

  it('skips a disabled step', () => {
    const off: FlowStep[] = flow.map((s) =>
      s.id === 'verify' ? { ...s, enabled: false } : s,
    );

    expect(resolveFlowStep(off, 2, none)?.step.id).toBe('enhance');
  });

  it('follows the Director for director_decides and runs the step when it has not decided', () => {
    const custom: FlowStep[] = [
      {
        id: 'extra',
        kind: 'custom',
        label: 'Extra',
        enabled: true,
        when: 'director_decides',
        instructions: 'look at x',
        locked: false,
      },
      ...flow,
    ];

    expect(resolveFlowStep(custom, 0, none)?.step.id).toBe('extra');
    expect(
      resolveFlowStep(custom, 0, { lane: null, decisions: { extra: false } })?.step.id,
    ).toBe('survey');
  });

  it('returns null past the last step and clamps a negative cursor', () => {
    expect(resolveFlowStep(flow, flow.length, none)).toBeNull();
    expect(resolveFlowStep(flow, -3, none)?.index).toBe(0);
  });
});
