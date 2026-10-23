/**
 * Tests for the lane a planned ticket is filed in.
 *
 * Why: approval may only raise the planner's lane, and it must raise from what the planner wrote.
 *   Judging the filed text (body plus acceptance, files and a footer) lifted a short Express ticket
 *   to Standard on words the planner never wrote (T2 in the eval), and the raise was silent. An
 *   owner-set lane is honoured (d-0177): size raises leave it alone, a Tier C path still forces Full.
 *
 * Pins: body-only length input, the raise note naming the reason, no note when nothing was raised,
 *   `lane_by_owner` skipping the file-count and body-length raises, Tier C forcing Full either way.
 * Depends on: src/tick/plan-ticket-lane, vitest.
 */

import { describe, expect, it } from 'vitest';
import { planTicketLane } from '#/tick/plan-ticket-lane.js';

const TIER_C = ['.github/**', 'packages/db/migrations/**'];
const ticket = (over: Record<string, unknown> = {}) => ({
  lane: 'express' as const,
  files: ['src/a.ts'],
  body: 'Do it.',
  ...over,
});

describe('planTicketLane', () => {
  it('keeps an Express ticket Express and writes no note when nothing raises it', () => {
    expect(planTicketLane(ticket(), TIER_C)).toEqual({
      lane: 'express',
      tierC: false,
      note: null,
    });
  });

  it('judges the body the planner wrote, not text added by filing', () => {
    // 1900 characters is under the 2000 cap on its own; the old input added acceptance and a footer on top.
    const out = planTicketLane(ticket({ body: 'x'.repeat(1900) }), TIER_C);

    expect(out.lane).toBe('express');
    expect(out.note).toBeNull();
  });

  it('raises a body over the cap and says which and why', () => {
    const out = planTicketLane(ticket({ body: 'x'.repeat(2100) }), TIER_C);

    expect(out.lane).toBe('standard');
    expect(out.note).toBe(
      'Lane raised from express to standard: body length 2100 > 2000',
    );
  });

  it('raises more than three files and names the count', () => {
    const files = ['a', 'b', 'c', 'd'].map((n) => `src/${n}.ts`);

    const out = planTicketLane(ticket({ files }), TIER_C);

    expect(out.lane).toBe('standard');
    expect(out.note).toBe(
      'Lane raised from express to standard: 4 files predicted (> 3)',
    );
  });

  it('never lowers the planner lane', () => {
    const out = planTicketLane(ticket({ lane: 'full' }), TIER_C);

    expect(out).toEqual({ lane: 'full', tierC: false, note: null });
  });

  it('forces Full and Tier C for a protected path, and names the path', () => {
    const out = planTicketLane(ticket({ files: ['.github/workflows/ci.yml'] }), TIER_C);

    expect(out.lane).toBe('full');
    expect(out.tierC).toBe(true);
    expect(out.note).toContain('.github/workflows/ci.yml');
  });

  describe('when the owner set the lane', () => {
    it('skips the size raises: many files and a long body stay as chosen', () => {
      const files = ['a', 'b', 'c', 'd', 'e'].map((n) => `src/${n}.ts`);

      const out = planTicketLane(
        ticket({ files, body: 'x'.repeat(5000), lane_by_owner: true }),
        TIER_C,
      );

      expect(out).toEqual({ lane: 'express', tierC: false, note: null });
    });

    it('still forces Full for a Tier C path, with only the Tier C reason', () => {
      const files = ['a', 'b', 'c', 'd'].map((n) => `src/${n}.ts`);

      const out = planTicketLane(
        ticket({
          files: [...files, 'packages/db/migrations/1.sql'],
          lane: 'standard',
          lane_by_owner: true,
        }),
        TIER_C,
      );

      expect(out.lane).toBe('full');
      expect(out.tierC).toBe(true);
      expect(out.note).toContain('tier-C path touched');
      expect(out.note).not.toContain('files predicted');
    });
  });
});
