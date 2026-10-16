/**
 * Pins: the flow editing rules: what a step may do, what a locked step refuses, the list that
 * results from each edit, and the problems reported before a save.
 *
 * Why: the write-plan and approve steps carry the approval rules (d-0146). If the editor let
 *   one be moved, switched off or removed, or let a custom step land after them, an owner
 *   could save a flow that plans without the floor. These tests hold the rules the editor
 *   offers (and the message each breach gets) so the buttons and the server agree.
 * Depends on: domain/director-flow-edit, domain/director-defaults. No DOM.
 */

import type { FlowStep } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FLOW } from '#/domain/director-defaults.js';
import {
  addCustomStep,
  customStepId,
  flowIssues,
  LOCKED_REASON,
  moveStep,
  patchStep,
  removeStep,
  stepAction,
} from '#/domain/director-flow-edit.js';

const flow = (): FlowStep[] => structuredClone([...DEFAULT_FLOW]);
const ids = (steps: readonly FlowStep[]): string[] => steps.map((s) => s.id);

describe('moving steps', () => {
  it('swaps a step with its neighbour', () => {
    expect(ids(moveStep(flow(), 'verify', -1))).toEqual([
      'survey',
      'verify',
      'grill',
      'enhance',
      'write_plan',
      'approve',
    ]);
  });

  it('refuses to move the first step up and the last free step down', () => {
    expect(stepAction(flow(), 'survey', -1)).toEqual({
      ok: false,
      reason: 'Already first.',
    });

    expect(stepAction(flow(), 'enhance', 1)).toMatchObject({ ok: false });
    expect(ids(moveStep(flow(), 'enhance', 1))).toEqual(ids(flow()));
  });

  it('never moves a locked step, in either direction', () => {
    for (const id of ['write_plan', 'approve']) {
      for (const direction of [-1, 1] as const) {
        expect(stepAction(flow(), id, direction)).toEqual({
          ok: false,
          reason: LOCKED_REASON,
        });

        expect(ids(moveStep(flow(), id, direction))).toEqual(ids(flow()));
      }
    }
  });
});

describe('editing a step', () => {
  it('switches a free step off and changes its condition', () => {
    const next = patchStep(flow(), 'grill', { enabled: false, when: 'director_decides' });

    expect(next.find((s) => s.id === 'grill')).toMatchObject({
      enabled: false,
      when: 'director_decides',
    });
  });

  it('lets a locked step change its instructions but nothing that unlocks it', () => {
    const next = patchStep(flow(), 'approve', {
      enabled: false,
      when: { lanes: ['full'] },
      instructions: 'Be strict.',
    });

    expect(next.find((s) => s.id === 'approve')).toMatchObject({
      enabled: true,
      when: 'always',
      locked: true,
      instructions: 'Be strict.',
    });
  });

  it('removes a free step and keeps a locked one', () => {
    expect(ids(removeStep(flow(), 'enhance'))).not.toContain('enhance');
    expect(ids(removeStep(flow(), 'write_plan'))).toContain('write_plan');
  });
});

describe('adding a custom step', () => {
  it('inserts it before the locked tail with a unique id', () => {
    const once = addCustomStep(flow(), {
      name: 'Check naming',
      instructions: ' Use kebab. ',
    });

    const twice = addCustomStep(once, { name: 'Check naming', instructions: 'Again' });

    expect(ids(twice).slice(-4)).toEqual([
      'check-naming',
      'check-naming-2',
      'write_plan',
      'approve',
    ]);

    expect(once.find((s) => s.id === 'check-naming')).toEqual({
      id: 'check-naming',
      kind: 'custom',
      label: 'Check naming',
      enabled: true,
      when: 'always',
      instructions: 'Use kebab.',
      locked: false,
    });
  });

  it('makes an id that starts with a letter from any name', () => {
    expect(customStepId(flow(), '2nd pass!')).toBe('custom-2nd-pass');
    expect(customStepId(flow(), '!!!')).toBe('custom-step');
  });
});

describe('checking the list', () => {
  it('accepts the default flow and any list the editor can produce', () => {
    expect(flowIssues(flow())).toEqual([]);

    const edited = addCustomStep(moveStep(flow(), 'verify', -1), {
      name: 'Extra',
      instructions: 'Do it',
    });

    expect(flowIssues(edited)).toEqual([]);
  });

  it('names each breach of the locked-step rules', () => {
    const messages = (steps: FlowStep[]): string[] =>
      flowIssues(steps).map((i) => i.message);

    expect(messages(flow().filter((s) => s.kind !== 'approve'))).toContain(
      'The flow needs exactly one approve step.',
    );

    expect(messages([...flow().slice(0, 4), flow()[5]!, flow()[4]!])).toEqual(
      expect.arrayContaining([
        'The approve step must be last.',
        'The write_plan step must come right before approve.',
      ]),
    );

    expect(
      messages(flow().map((s) => (s.kind === 'approve' ? { ...s, enabled: false } : s))),
    ).toContain('The approve step must stay locked and switched on.');
  });

  it('ties step problems to the step: custom without instructions, no lanes, missing playbook', () => {
    const broken = flow().map((s) =>
      s.id === 'enhance' ? { ...s, when: { lanes: [] }, playbook_id: 'gone' } : s,
    ) as FlowStep[];

    const custom = addCustomStep(broken, { name: 'Extra', instructions: 'x' }).map((s) =>
      s.id === 'extra' ? { ...s, instructions: '  ' } : s,
    );

    const issues = flowIssues(custom, {});

    expect(issues).toEqual(
      expect.arrayContaining([
        { stepId: 'enhance', message: 'Pick at least one lane.' },
        { stepId: 'enhance', message: 'The playbook gone does not exist.' },
        { stepId: 'extra', message: 'A custom step needs instructions.' },
      ]),
    );
  });

  it('reports duplicate ids', () => {
    const twin = [flow()[0]!, ...flow()];

    expect(flowIssues(twin).map((i) => i.message)).toContain('Step ids must be unique.');
  });
});
