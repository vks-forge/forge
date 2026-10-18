/**
 * Pins that a pipeline change has one stable name no matter who wrote it or why.
 *
 * Why: the Director proposes a change to a project's lane only after the same change was applied to
 *   several tickets, so "the same change" must be decided by plain code: the same op on the same anchor in
 *   the same lane is one key, whatever reason the Director quoted, whatever stage id it invented for an added
 *   stage, and whatever position the op had in the log. A key that leaked the reason would never repeat and
 *   no proposal would ever be made; a key that ignored the lane or anchor would merge unlike changes.
 *
 * Pins: the documented key shapes, a key that ignores the reason and the invented stage id, one that differs by lane,
 *   anchor and agent, and one that stays within 120 characters.
 * Depends on: src/domain/adjustment-key, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { adjustmentKey } from '#/domain/adjustment-key.js';
import type { PipelineAdjustOp } from '#/schemas/pipeline-adjust.js';

const reason = fc
  .string({ minLength: 10, maxLength: 80 })
  .filter((s) => s.trim().length >= 10);

const slug = fc.stringMatching(/^[a-z][a-z0-9]{1,10}$/);
const lane = fc.constantFrom<'express' | 'standard' | 'full'>(
  'express',
  'standard',
  'full',
);

const addOp = (
  agent: string,
  after: string,
  id: string,
  why: string,
): PipelineAdjustOp => ({
  op: 'add',
  stage: { id: `dir-${id}`, kind: 'agent', label: 'Extra', agent },
  after,
  reason: why,
});

describe('adjustmentKey', () => {
  it('names the documented shapes', () => {
    expect(
      adjustmentKey(
        'standard',
        addOp('security-reviewer', 'g1', 'x', 'because auth code'),
      ),
    ).toBe('standard:add:security-reviewer@after:g1');

    expect(
      adjustmentKey('standard', {
        op: 'remove',
        stage_id: 'review',
        reason: 'tiny change only',
      }),
    ).toBe('standard:remove:review');

    expect(
      adjustmentKey('full', {
        op: 'swap',
        stage_id: 'implement',
        agent: 'frontend-writer',
        reason: 'only web files',
      }),
    ).toBe('full:swap:implement:frontend-writer');

    expect(
      adjustmentKey('full', {
        op: 'move',
        stage_id: 'a',
        after: 'b',
        reason: 'order matters here',
      }),
    ).toBe('full:move:a@after:b');
  });

  it('ignores the reason and the invented stage id', () => {
    fc.assert(
      fc.property(
        slug,
        slug,
        slug,
        slug,
        reason,
        reason,
        lane,
        (agent, after, a, b, r1, r2, l) => {
          expect(adjustmentKey(l, addOp(agent, after, a, r1))).toBe(
            adjustmentKey(l, addOp(agent, after, b, r2)),
          );
        },
      ),
    );
  });

  it('differs by lane, anchor and agent', () => {
    fc.assert(
      fc.property(slug, slug, slug, reason, (agent, after, other, r) => {
        fc.pre(other !== after && other !== agent);
        const k = adjustmentKey('standard', addOp(agent, after, 'x', r));
        expect(adjustmentKey('full', addOp(agent, after, 'x', r))).not.toBe(k);
        expect(adjustmentKey('standard', addOp(agent, other, 'x', r))).not.toBe(k);
        expect(adjustmentKey('standard', addOp(other, after, 'x', r))).not.toBe(k);
      }),
    );
  });

  it('stays within the stored length', () => {
    const long = 'a'.repeat(40);
    const key = adjustmentKey('standard', {
      op: 'add',
      stage: {
        id: 'dir-x',
        kind: 'group',
        label: 'Group',
        join: 'all',
        members: [
          { id: 'm1', kind: 'agent', label: 'One', agent: long },
          { id: 'm2', kind: 'agent', label: 'Two', agent: long },
          { id: 'm3', kind: 'agent', label: 'Three', agent: long },
        ],
      },
      after: long,
      reason: 'a long reason that is irrelevant',
    });

    expect(key.length).toBeLessThanOrEqual(120);
  });
});
