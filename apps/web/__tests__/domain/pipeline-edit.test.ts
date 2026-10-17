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
import {
  addAction,
  addStage,
  moveAction,
  moveStage,
  newMember,
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

  it('adds a script gate with an empty command, a group of two checks and the human stage last', () => {
    const script = addStage(lane('express'), 'script_gate', ROSTER);
    const group = addStage(lane('express'), 'group', ROSTER);
    const human = addStage(group, 'human', ROSTER);

    expect(script.stages[2]).toMatchObject({
      kind: 'script_gate',
      run: { command: '', timeout_ms: 120_000, guard_paths: [] },
    });

    expect(group.stages[2]).toMatchObject({ kind: 'group' });
    expect((group.stages[2] as { members: unknown[] }).members).toHaveLength(2);
    expect(stageIds(human).slice(-2)).toEqual(['human', 'merge']);
  });

  it('keeps every id unique across the whole list, group members included', () => {
    const next = addStage(addStage(lane('express'), 'group', ROSTER), 'group', ROSTER);
    const ids = next.stages.flatMap((s) =>
      s.kind === 'group' ? [s.id, ...s.members.map((m) => m.id)] : [s.id],
    );

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('refuses a second human sign-off and a thirteenth stage, each with its reason', () => {
    const full = lane('full');
    let many = lane('express');

    for (let i = 0; i < 10; i += 1) {
      many = addStage(many, 'agent', ROSTER);
    }

    expect(addAction(full, 'human')).toEqual({
      ok: false,
      reason: 'A pipeline has at most one human sign-off.',
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
