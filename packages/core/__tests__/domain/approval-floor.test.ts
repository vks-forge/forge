/**
 * Tests for the approval floor.
 *
 * Why: the floor is what stops the Director from approving a risky plan on its own judgement.
 *   If it passed a plan that touches a Tier C path, repeats a rejected approach, collides with
 *   another approved card or sits on files that moved since verification, the owner's
 *   protections would be advisory. Properties pin that each breach alone fails the floor, that
 *   the floor is a function of the facts only (order and duplicates do not matter) and that it
 *   can only get stricter as facts are added.
 *
 * Pins: each of the four breaches, reasons naming the offender, Windows path spelling,
 *   pass on a clean plan, monotonicity and order independence by property.
 * Depends on: src/domain/approval-floor, tests/helpers/plan-fixtures, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkFloor } from '#/domain/approval-floor.js';
import type { CardId } from '#/schemas/ids.js';
import { plan, ticket } from '#tests/helpers/plan-fixtures.js';

const TIER_C = ['.forge/**', '.claude/**', '.github/**'];
const clean = { tierCGlobs: TIER_C, otherPlannedFiles: [], changedSinceBase: [] };
const other = (id: string, files: string[]) => ({ cardId: id as CardId, files });

describe('checkFloor', () => {
  it('passes a plan with no breach', () => {
    expect(checkFloor({ plan: plan(), ...clean })).toEqual({ pass: true, reasons: [] });
  });

  it('fails when a ticket plans a Tier C path and names it', () => {
    const p = plan({ tickets: [ticket('t1', { files: ['.github/workflows/ci.yml'] })] });

    const r = checkFloor({ plan: p, ...clean });

    expect(r.pass).toBe(false);
    expect(r.reasons.join(' ')).toContain('.github/workflows/ci.yml');
  });

  it('fails when the plan contradicts an answer the owner gave, naming the answer and where', () => {
    const p = {
      ...plan(),
      decision_conflicts: [
        {
          question: 'Where are todos stored?',
          answer: 'Local storage',
          where: 'non_goals: no local storage',
        },
      ],
    };

    const r = checkFloor({ plan: p, ...clean });

    expect(r.pass).toBe(false);
    expect(r.reasons.join(' ')).toContain('Local storage');
    expect(r.reasons.join(' ')).toContain('non_goals: no local storage');
  });

  it('reads a backslash path as the same Tier C path', () => {
    const p = plan({ tickets: [ticket('t1', { files: ['.forge\\config\\x.yaml'] })] });

    expect(checkFloor({ plan: p, ...clean }).pass).toBe(false);
  });

  it('fails when verification matched a rejected approach', () => {
    const p = plan({
      verification: {
        ...plan().verification,
        rejected_hits: ['r-0003 always-on janitor'],
      },
    });

    const r = checkFloor({ plan: p, ...clean });

    expect(r.pass).toBe(false);
    expect(r.reasons.join(' ')).toContain('r-0003');
  });

  it('fails on an overlap with another approved card and names the card and file', () => {
    const r = checkFloor({
      plan: plan(),
      ...clean,
      otherPlannedFiles: [other('SF-C7', ['src/t2.ts', 'src/z.ts'])],
    });

    expect(r.pass).toBe(false);
    expect(r.reasons.join(' ')).toContain('SF-C7');
    expect(r.reasons.join(' ')).toContain('src/t2.ts');
  });

  it('does not fail on another card with different files', () => {
    const r = checkFloor({
      plan: plan(),
      ...clean,
      otherPlannedFiles: [other('SF-C7', ['src/z.ts'])],
    });

    expect(r.pass).toBe(true);
  });

  it('fails when a planned file changed since the plan was verified', () => {
    const r = checkFloor({ plan: plan(), ...clean, changedSinceBase: ['src/t1.ts'] });

    expect(r.pass).toBe(false);
    expect(r.reasons.join(' ')).toContain('src/t1.ts');
  });

  it('reports one reason per breach', () => {
    const p = plan({
      tickets: [ticket('t1', { files: ['.claude/settings.json'] })],
      verification: { ...plan().verification, rejected_hits: ['r-1'] },
    });

    const r = checkFloor({
      plan: p,
      ...clean,
      otherPlannedFiles: [other('SF-C2', ['.claude/settings.json'])],
      changedSinceBase: ['.claude/settings.json'],
    });

    expect(r.reasons).toHaveLength(4);
  });

  describe('properties', () => {
    const file = fc.stringMatching(/^[a-z]{1,6}\/[a-z]{1,6}\.ts$/);
    const planOf = (files: string[]) =>
      plan({ tickets: files.map((f, i) => ticket(`t${i + 1}`, { files: [f] })) });

    it('any planned file that another card also plans fails the floor', () => {
      fc.assert(
        fc.property(fc.array(file, { minLength: 1, maxLength: 5 }), (files) => {
          const r = checkFloor({
            plan: planOf(files),
            ...clean,
            otherPlannedFiles: [other('SF-C9', [files[0] as string])],
          });

          expect(r.pass).toBe(false);
        }),
      );
    });

    it('any changed planned file fails the floor, and unrelated facts alone never do', () => {
      fc.assert(
        fc.property(fc.array(file, { minLength: 1, maxLength: 5 }), (files) => {
          const failing = checkFloor({
            plan: planOf(files),
            ...clean,
            changedSinceBase: [files[files.length - 1] as string],
          });

          expect(failing.pass).toBe(false);
          expect(checkFloor({ plan: planOf(files), ...clean }).pass).toBe(true);
        }),
      );
    });

    it('is monotone: adding a fact never turns a failure into a pass', () => {
      fc.assert(
        fc.property(
          fc.array(file, { minLength: 1, maxLength: 4 }),
          fc.array(file, { maxLength: 4 }),
          fc.array(file, { maxLength: 4 }),
          (files, others, changed) => {
            const base = { plan: planOf(files), ...clean, changedSinceBase: changed };
            const more = {
              ...base,
              otherPlannedFiles: [other('SF-C3', others)],
            };

            if (!checkFloor(base).pass) {
              expect(checkFloor(more).pass).toBe(false);
            }
          },
        ),
      );
    });

    it('does not depend on the order or repetition of the facts', () => {
      fc.assert(
        fc.property(
          fc.array(file, { minLength: 1, maxLength: 4 }),
          fc.array(file, { maxLength: 4 }),
          (files, changed) => {
            const a = checkFloor({
              plan: planOf(files),
              ...clean,
              changedSinceBase: changed,
            });

            const b = checkFloor({
              plan: planOf([...files].reverse()),
              ...clean,
              changedSinceBase: [...changed, ...changed].reverse(),
            });

            expect(b.pass).toBe(a.pass);
          },
        ),
      );
    });
  });
});

describe('checkFloor: lighter pipelines (d-0141 item 6)', () => {
  const lighter = [{ key: 't2', removed: ['reviewer'] }];

  it('a lighter entry always fails the floor and names the ticket and what it drops', () => {
    const r = checkFloor({ plan: plan(), ...clean, lighter });

    expect(r.pass).toBe(false);
    expect(r.reasons).toEqual([
      't2 runs a lighter pipeline than its lane (removes reviewer)',
    ]);
  });

  it('writes one reason per entry', () => {
    const r = checkFloor({
      plan: plan(),
      ...clean,
      lighter: [
        lighter[0] as (typeof lighter)[number],
        { key: 't1', removed: ['test-writer', 'reviewer'] },
      ],
    });

    expect(r.reasons).toHaveLength(2);
    expect(r.reasons[1]).toContain('removes test-writer, reviewer');
  });

  it('no entries, or none given, never adds a reason', () => {
    expect(checkFloor({ plan: plan(), ...clean, lighter: [] })).toEqual({
      pass: true,
      reasons: [],
    });

    expect(checkFloor({ plan: plan(), ...clean })).toEqual({ pass: true, reasons: [] });
  });

  it('adds one reason per unverified outside claim and none when there are none', () => {
    const r = checkFloor({
      plan: plan(),
      ...clean,
      unverified: ['The API limit is 100 per minute', 'It supports OAuth'],
    });

    expect(r.pass).toBe(false);
    expect(r.reasons).toEqual([
      'Plan rests on an unverified outside claim: The API limit is 100 per minute',
      'Plan rests on an unverified outside claim: It supports OAuth',
    ]);

    expect(checkFloor({ plan: plan(), ...clean, unverified: [] })).toEqual({
      pass: true,
      reasons: [],
    });
  });

  it('adds a reason naming each ticket the approval would cancel without covering', () => {
    const r = checkFloor({
      plan: plan(),
      ...clean,
      uncovered: ['CHE-3 Auth.js', 'CHE-6 LLM client'],
    });

    expect(r.pass).toBe(false);
    expect(r.reasons).toEqual([
      'approving cancels tickets this plan does not cover: CHE-3 Auth.js; CHE-6 LLM client',
    ]);

    expect(checkFloor({ plan: plan(), ...clean, uncovered: [] }).pass).toBe(true);
  });
});
