/**
 * Pins: the pipeline edit rules: where a new stage lands, what may move or go, one human
 * sign-off, group size, check policy stored as differences from defaults, and where each
 * problem is filed.
 *
 * Why: the editor's buttons are only as safe as these rules. Merge must stay last and G1 in
 * place or an unchecked change could merge; a stage added in the wrong zone would be refused
 * on save with no hint why; a policy stored with its defaults spelled out would make an
 * untouched lane look edited and never pick up a better shipped default.
 * Depends on: domain/pipeline-edit, helpers/pipeline-world.
 */

import { describe, expect, it } from 'vitest';
import { addAction, addStage, newMember } from '#/domain/pipeline-add.js';
import {
  isWriterGroup,
  moveAction,
  moveStage,
  removeAction,
  removeStage,
} from '#/domain/pipeline-edit.js';
import { ROSTER, lane, stageIds } from '#tests/helpers/pipeline-lists.js';

describe('adding stages', () => {
  it('puts a check agent after G1 and before merge', () => {
    const next = addStage(lane('express'), 'agent', ROSTER);

    expect(stageIds(next)).toEqual(['implementer', 'g1', 'reviewer', 'merge']);
  });

  it('gives a repeated agent a free id', () => {
    const next = addStage(lane('standard'), 'agent', ROSTER);

    expect(stageIds(next)).toEqual([
      'test-writer',
      'implementer',
      'g1',
      'reviewer',
      'reviewer-2',
      'merge',
    ]);
  });

  it('adds a script gate with an empty command, a group of two checks and the sign-off last', () => {
    const script = addStage(lane('express'), 'script_gate', ROSTER);
    const group = addStage(lane('express'), 'group', ROSTER);
    const human = addStage(group, 'sign_off', ROSTER);

    expect(script.stages[2]).toMatchObject({
      kind: 'script_gate',
      run: { command: '', timeout_ms: 120_000, guard_paths: [] },
    });

    expect(group.stages[2]).toMatchObject({ kind: 'group' });
    expect((group.stages[2] as { members: unknown[] }).members).toHaveLength(2);
    expect(stageIds(human).slice(-2)).toEqual(['sign-off', 'merge']);
  });

  it('keeps every id unique across the whole list, group members included', () => {
    const next = addStage(addStage(lane('express'), 'group', ROSTER), 'group', ROSTER);
    const ids = next.stages.flatMap((s) =>
      s.kind === 'group' ? [s.id, ...s.members.map((m) => m.id)] : [s.id],
    );

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('refuses a second sign-off and a thirteenth stage, each with its reason', () => {
    const full = lane('full');
    let many = lane('express');

    for (let i = 0; i < 10; i += 1) {
      many = addStage(many, 'agent', ROSTER);
    }

    expect(addAction(full, 'sign_off')).toEqual({
      ok: false,
      reason: 'A pipeline has at most one sign-off.',
    });

    expect(addAction(many, 'agent')).toMatchObject({ ok: false });
    expect(addAction(lane('express'), 'agent')).toEqual({ ok: true });
  });

  it('builds a group member that is a reviewer by default', () => {
    expect(newMember('agent', 'g-3', ROSTER)).toMatchObject({ agent: 'reviewer' });
    expect(newMember('script_gate', 'g-3', ROSTER)).toMatchObject({
      kind: 'script_gate',
    });
  });
});

describe('moving and removing', () => {
  it('keeps merge and G1 where they are, with the reason', () => {
    const def = lane('standard');

    expect(moveAction(def, 'merge', -1)).toMatchObject({ ok: false });
    expect(moveAction(def, 'g1', 1)).toMatchObject({ ok: false });
    expect(removeAction(def, 'merge')).toMatchObject({ ok: false });
    expect(removeAction(def, 'g1')).toMatchObject({ ok: false });
    expect(moveStage(def, 'merge', -1)).toBe(def);
    expect(removeStage(def, 'g1')).toBe(def);
  });

  it('swaps a stage with its neighbour and refuses to pass the ends', () => {
    const def = lane('standard');

    expect(stageIds(moveStage(def, 'implementer', -1))).toEqual([
      'implementer',
      'test-writer',
      'g1',
      'reviewer',
      'merge',
    ]);

    expect(moveAction(def, 'test-writer', -1)).toEqual({
      ok: false,
      reason: 'It is already first.',
    });

    expect(moveAction(def, 'reviewer', 1)).toEqual({
      ok: false,
      reason: 'Merge always stays last.',
    });
  });

  it('removes an ordinary stage', () => {
    expect(stageIds(removeStage(lane('standard'), 'reviewer'))).toEqual([
      'test-writer',
      'implementer',
      'g1',
      'merge',
    ]);
  });
});

describe('adding the Director check, the sign-off and a writer group', () => {
  it('puts the Director check after every check and before the sign-off', () => {
    const standard = addStage(lane('standard'), 'director_check', ROSTER);
    const withSignOff = addStage(standard, 'sign_off', ROSTER);

    expect(stageIds(standard)).toEqual([
      'test-writer',
      'implementer',
      'g1',
      'reviewer',
      'check-plan',
      'merge',
    ]);

    expect(stageIds(addStage(withSignOff, 'agent', ROSTER)).slice(-4)).toEqual([
      'reviewer-2',
      'check-plan',
      'sign-off',
      'merge',
    ]);
  });

  it('starts a sign-off the Director may sign, asking the owner for tier C', () => {
    const next = addStage(lane('express'), 'sign_off', ROSTER);

    expect(next.stages.at(-2)).toMatchObject({
      kind: 'sign_off',
      signer: 'director_or_owner',
    });
  });

  it('refuses a second Director check, and a sign-off beside the older human stage', () => {
    expect(addAction(lane('full'), 'director_check')).toEqual({
      ok: false,
      reason: 'A pipeline has at most one Director check.',
    });

    const human = {
      ...lane('express'),
      stages: [
        ...lane('express').stages.slice(0, 2),
        { id: 'human', kind: 'human' as const, label: 'You', prompt: 'Look.' },
        ...lane('express').stages.slice(2),
      ],
    };

    expect(addAction(human, 'sign_off')).toMatchObject({ ok: false });
  });

  it('adds a group of two writers before G1, which reads as a writer group', () => {
    const next = addStage(lane('standard'), 'writer_group', ROSTER);
    const group = next.stages.find((s) => s.kind === 'group');

    expect(stageIds(next).indexOf('writers')).toBeLessThan(stageIds(next).indexOf('g1'));
    expect(group?.kind === 'group' && group.members).toHaveLength(2);
    expect(group?.kind === 'group' && isWriterGroup(group, ROSTER)).toBe(true);
  });

  it('does not take a group of reviewers for a writer group', () => {
    const next = addStage(lane('standard'), 'group', ROSTER);
    const group = next.stages.find((s) => s.kind === 'group');

    expect(group?.kind === 'group' && isWriterGroup(group, ROSTER)).toBe(false);
  });

  it('builds a writer group member from a writer, not a reviewer', () => {
    expect(newMember('agent', 'w-3', ROSTER, true)).not.toMatchObject({
      agent: 'reviewer',
    });
  });
});
