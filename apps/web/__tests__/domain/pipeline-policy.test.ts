/**
 * Pins: a check policy is read with its defaults and stored only as differences from them, the
 * places a check can send work back to are the writers above it, and problems are filed under
 * the row they belong to.
 *
 * Why: a policy stored with its defaults spelled out would make an untouched lane look edited and
 * never pick up a better shipped default; a "send back to" that offered a later stage would be
 * refused on save; a problem shown above the list instead of beside its row would leave the owner
 * hunting for the stage to fix.
 * Depends on: domain/pipeline-policy, domain/pipeline-inspect, helpers/pipeline-world.
 */

import { describe, expect, it } from 'vitest';
import { indexProblems, sameDefinition } from '#/domain/pipeline-inspect.js';
import { policyOf, withPolicy, writersAbove } from '#/domain/pipeline-policy.js';
import { uniqueId } from '#/domain/pipeline-edit.js';
import { ROSTER, lane } from '#tests/helpers/pipeline-lists.js';

describe('check policy', () => {
  it('reads defaults and stores only what differs from them', () => {
    const review = lane('standard').stages[3] as Parameters<typeof policyOf>[0];
    const view = policyOf(review);

    expect(view).toEqual({
      on_blocking: 'rework',
      blocking: ['critical', 'high'],
      rework_to: '',
    });

    expect(withPolicy(review, view)).toEqual(review);
    expect(withPolicy(review, { ...view, on_blocking: 'hold' })).toMatchObject({
      on_blocking: 'hold',
    });

    expect(
      withPolicy(review, { ...view, blocking: ['critical', 'high', 'medium'] }),
    ).toMatchObject({ blocking: ['critical', 'high', 'medium'] });

    expect(withPolicy(review, { ...view, rework_to: 'test-writer' })).toMatchObject({
      rework_to: 'test-writer',
    });
  });

  it('offers only the writers above a stage as places to send work back', () => {
    const def = lane('standard');

    expect(writersAbove(def, 'reviewer', ROSTER).map((w) => w.id)).toEqual([
      'test-writer',
      'implementer',
    ]);

    expect(writersAbove(def, 'implementer', ROSTER).map((w) => w.id)).toEqual([
      'test-writer',
    ]);
  });
});

describe('problems and identity', () => {
  it('files a problem under its row, a member under its group and the rest as general', () => {
    const def = lane('full');
    const index = indexProblems(def, [
      { code: 'self_review', stage_id: 'implementer', message: 'a' },
      { code: 'group_writer', stage_id: 'critique', message: 'b' },
      { code: 'no_writer', message: 'c' },
      { code: 'no_writer', message: 'c' },
    ]);

    expect(index.byStage.get('implementer')).toHaveLength(1);
    expect(index.byStage.get('review-group')?.[0]?.code).toBe('group_writer');
    expect(index.general).toHaveLength(1);
  });

  it('compares lists whatever the key order, and makes free ids', () => {
    const a = lane('express');
    const b = JSON.parse(JSON.stringify(a)) as typeof a;
    const first = b.stages[0] as {
      id: string;
      kind: string;
      label: string;
      agent: string;
    };

    b.stages[0] = { agent: first.agent, label: first.label, kind: 'agent', id: first.id };

    expect(sameDefinition(a, b)).toBe(true);
    expect(sameDefinition(a, lane('standard'))).toBe(false);
    expect(uniqueId('x', new Set(['x', 'x-2']))).toBe('x-3');
  });
});
