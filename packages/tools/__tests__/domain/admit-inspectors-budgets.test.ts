/**
 * Pins inspectors and budgets inside admit(): both may only raise a decision.
 *
 * Why: inspectors (pattern, injection, path checks) and budgets run after rules and must
 * be monotone and fail closed. An inspector that throws, returns nonsense, or tries to
 * lower a deny must never produce an allow, and a spend limit must stop or pause a run
 * at the tool boundary.
 *
 * Pins: admit() with ctx.inspectors and ctx.budget.
 * Depends on: domain/admit, domain/budgets, helpers/fixtures, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { admit } from '#/domain/admit.js';
import { EMPTY_USAGE, recordUsage } from '#/domain/budgets.js';
import type { Decision } from '#/schemas/decision.js';
import { call, makeCtx } from '#tests/helpers/fixtures.js';

const sh = (command: string, native = 'PowerShell') =>
  call('shell', { command }, { native });
const verdict = (d: Decision) => [d.decision, d.reason];

describe('inspectors (monotone, fail closed)', () => {
  const c = call('read', { path: 'a' });

  it('lets an inspector raise allow to ask and records the finding id', () => {
    const ctx = makeCtx('standard', {
      inspectors: [() => ({ effect: 'ask', finding_id: 'F-1' })],
    });
    const d = admit(ctx, c);
    expect(verdict(d)).toEqual(['ask', 'inspector_raised']);
    expect(d.finding_ids).toEqual(['F-1']);
    expect(d.layer).toBe('inspector');
  });

  it('never lowers a decision', () => {
    const ctx = makeCtx('standard', { inspectors: [() => ({ effect: 'allow' })] });
    expect(verdict(admit(ctx, sh('pnpm add zod')))).toEqual(['ask', 'rule_ask']);
    expect(verdict(admit(ctx, sh('git push')))).toEqual(['deny', 'managed_deny']);
  });

  it('denies when an inspector throws or returns nonsense', () => {
    const boom = makeCtx('full', {
      inspectors: [
        () => {
          throw new Error('x');
        },
      ],
    });
    expect(verdict(admit(boom, c))).toEqual(['deny', 'inspector_error']);
    const junk = makeCtx('full', {
      inspectors: [() => ({ effect: 'toString' }) as unknown as { effect: 'allow' }],
    });
    expect(verdict(admit(junk, c))).toEqual(['deny', 'inspector_error']);
  });

  it('takes the maximum across several inspectors', () => {
    const ctx = makeCtx('full', {
      inspectors: [
        () => ({ effect: 'ask', finding_id: 'a' }),
        () => ({ effect: 'deny', finding_id: 'b' }),
      ],
    });
    const d = admit(ctx, c);
    expect(d.decision).toBe('deny');
    expect(d.finding_ids).toEqual(['a', 'b']);
  });
});

describe('budgets', () => {
  it('denies a call over a hard cap and asks at a soft cap', () => {
    const usage = recordUsage(
      recordUsage(EMPTY_USAGE, 'mcp__forge__web_search', 0.5),
      'mcp__forge__web_search',
      0.5,
    );
    const hard = makeCtx('full', {
      budget: {
        limits: { run: {}, per_tool: { mcp__forge__web_search: { max_calls: 2 } } },
        usage,
      },
    });
    const c = call('mcp__forge__web_search', { query: 'x' });
    expect(verdict(admit(hard, c))).toEqual(['deny', 'budget_exceeded']);
    const soft = makeCtx('full', {
      budget: { limits: { run: { soft_usd: 0.8 }, per_tool: {} }, usage },
    });
    expect(verdict(admit(soft, c))).toEqual(['ask', 'budget_soft_limit']);
    const softExpress = makeCtx('express', {
      budget: { limits: { run: { soft_usd: 0.8 }, per_tool: {} }, usage },
    });
    expect(verdict(admit(softExpress, call('read', { path: 'a' })))).toEqual([
      'deny',
      'unattended',
    ]);
  });

  it('uses the estimated cost of the call', () => {
    const ctx = makeCtx('full', {
      budget: { limits: { run: { max_usd: 1 }, per_tool: {} }, usage: EMPTY_USAGE },
    });
    expect(admit(ctx, call('read', { path: 'a' }, { estimated_usd: 2 })).reason).toBe(
      'budget_exceeded',
    );
  });
});
