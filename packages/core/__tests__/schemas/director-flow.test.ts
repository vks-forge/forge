/**
 * Tests for the planning flow schema.
 *
 * Why: the two locked steps carry the safety rules of planning (write the plan, approve it
 *   behind the floor). If a saved flow could drop, disable, duplicate or reorder them, an
 *   edit in the settings page could produce a card that is approved without a plan or
 *   skips the approval step. The refinements are the only guard, so each invariant is pinned.
 *
 * Pins: the built-in flow is valid; missing, duplicate, unlocked, disabled and misplaced
 *   write_plan/approve steps are refused; duplicate ids and custom steps without
 *   instructions are refused; custom steps and lane conditions are accepted.
 * Depends on: src/schemas/director-flow, src/domain/builtin-director, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_DIRECTOR_CONFIG } from '#/domain/builtin-director.js';
import { DirectorFlow } from '#/schemas/director-flow.js';
import type { FlowStep } from '#/schemas/director-flow.js';

const builtin = (): FlowStep[] => structuredClone(BUILTIN_DIRECTOR_CONFIG.flow);
const without = (id: string): FlowStep[] => builtin().filter((s) => s.id !== id);
const custom = (over: Partial<FlowStep> = {}): FlowStep => ({
  id: 'extra',
  kind: 'custom',
  label: 'Extra check',
  enabled: true,
  when: 'always',
  instructions: 'Check the docs.',
  locked: false,
  ...over,
});

describe('DirectorFlow', () => {
  it('accepts the built-in flow', () => {
    expect(DirectorFlow.safeParse(builtin()).success).toBe(true);
  });

  it('accepts a custom step with instructions in the middle and a lane condition', () => {
    const flow = builtin();
    flow.splice(2, 0, custom({ when: { lanes: ['full'] } }));

    expect(DirectorFlow.safeParse(flow).success).toBe(true);
  });

  it.each([
    ['no write_plan step', without('write_plan')],
    ['no approve step', without('approve')],
    [
      'write_plan not locked',
      builtin().map((s) => (s.id === 'write_plan' ? { ...s, locked: false } : s)),
    ],
    [
      'approve disabled',
      builtin().map((s) => (s.id === 'approve' ? { ...s, enabled: false } : s)),
    ],
    ['a step after approve', [...builtin(), custom()]],
    [
      'write_plan not right before approve',
      (() => {
        const flow = builtin();
        flow.splice(flow.length - 1, 0, custom());

        return flow;
      })(),
    ],
    [
      'a custom step without instructions',
      [custom({ instructions: '  ' }), ...builtin()],
    ],
    ['duplicate step ids', [custom({ id: 'survey' }), ...builtin()]],
    ['a locked custom step', [custom({ locked: true }), ...builtin()]],
    ['an empty flow', []],
  ])('refuses %s', (_name, flow) => {
    expect(DirectorFlow.safeParse(flow).success).toBe(false);
  });

  it('refuses an unknown key on a step', () => {
    const flow = builtin().map((s) => ({ ...s, surprise: 1 }));

    expect(DirectorFlow.safeParse(flow).success).toBe(false);
  });

  describe('research step (d-0146)', () => {
    const research = (over: Partial<FlowStep> = {}): FlowStep => ({
      id: 'research',
      kind: 'research',
      label: 'Research outside facts',
      enabled: true,
      when: 'director_decides',
      depth: 'normal',
      playbook_id: 'research',
      locked: false,
      ...over,
    });

    const noResearch = (): FlowStep[] => builtin().filter((s) => s.kind !== 'research');

    it('ships once in the built-in flow, right after enhance', () => {
      const ids = builtin().map((s) => s.id);

      expect(ids.filter((id) => id === 'research')).toHaveLength(1);
      expect(ids.indexOf('research')).toBe(ids.indexOf('enhance') + 1);
    });

    it('can be added, moved and disabled', () => {
      const flow = noResearch();
      flow.splice(2, 0, research());
      expect(DirectorFlow.safeParse(flow).success).toBe(true);

      const moved = noResearch();
      moved.splice(0, 0, research({ enabled: false }));
      expect(DirectorFlow.safeParse(moved).success).toBe(true);
    });

    it('is never locked, at most once, and never after write_plan', () => {
      const locked = noResearch();
      locked.splice(2, 0, research({ locked: true }));
      expect(DirectorFlow.safeParse(locked).success).toBe(false);

      const twice = builtin();
      twice.splice(2, 0, research({ id: 'research2' }));
      expect(DirectorFlow.safeParse(twice).success).toBe(false);

      const late = noResearch();
      late.splice(late.length - 1, 0, research());
      expect(DirectorFlow.safeParse(late).success).toBe(false);
    });
  });
});
