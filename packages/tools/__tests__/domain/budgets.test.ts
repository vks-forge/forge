/**
 * Pins budget checks: hard caps deny, soft caps ask, nonsense counters deny.
 *
 * Why: a Worker looping on a metered tool must be stopped at the tool boundary, and a
 * missing or corrupt counter must never read as "no spend". These tests fix which scope
 * trips first and that soft limits ask rather than deny.
 *
 * Pins: checkBudget(), recordUsage(), EMPTY_USAGE.
 * Depends on: domain/budgets, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { EMPTY_USAGE, checkBudget, recordUsage } from '#/domain/budgets.js';
import type { BudgetLimits } from '#/schemas/budget.js';

const limits = (l: Partial<BudgetLimits>): BudgetLimits => ({
  run: {},
  per_tool: {},
  ...l,
});

describe('checkBudget', () => {
  it('allows when no limits are set', () => {
    expect(checkBudget(limits({}), EMPTY_USAGE, 'shell')).toEqual({ verdict: 'ok' });
  });

  it('denies the call that would exceed a per-tool call cap', () => {
    const l = limits({ per_tool: { shell: { max_calls: 2 } } });
    let u = EMPTY_USAGE;
    u = recordUsage(u, 'shell', 0);
    expect(checkBudget(l, u, 'shell').verdict).toBe('ok');
    u = recordUsage(u, 'shell', 0);
    expect(checkBudget(l, u, 'shell')).toEqual({
      verdict: 'deny',
      scope: 'tool',
      kind: 'calls',
    });
    expect(checkBudget(l, u, 'read').verdict).toBe('ok');
  });

  it('denies on estimated cost over the run cap', () => {
    const l = limits({ run: { max_usd: 1 } });
    const u = recordUsage(EMPTY_USAGE, 'web_search', 0.9);
    expect(checkBudget(l, u, 'web_search', 0.2)).toEqual({
      verdict: 'deny',
      scope: 'run',
      kind: 'usd',
    });
    expect(checkBudget(l, u, 'web_search', 0.05).verdict).toBe('ok');
  });

  it('asks at a soft cap and denies at the hard cap when both are crossed', () => {
    const l = limits({ run: { soft_calls: 1, max_calls: 3 } });
    const u1 = recordUsage(EMPTY_USAGE, 'a', 0);
    expect(checkBudget(l, u1, 'a')).toEqual({
      verdict: 'ask',
      scope: 'run',
      kind: 'calls',
    });
    const u3 = recordUsage(recordUsage(u1, 'a', 0), 'a', 0);
    expect(checkBudget(l, u3, 'a').verdict).toBe('deny');
  });

  it.each([[Number.NaN], [-1], [Number.POSITIVE_INFINITY]])(
    'denies an insane estimate (%s)',
    (est) => {
      expect(checkBudget(limits({}), EMPTY_USAGE, 'a', est)).toEqual({
        verdict: 'deny',
        scope: 'run',
        kind: 'invalid',
      });
    },
  );

  it('denies a corrupt counter', () => {
    const bad = { run: { calls: Number.NaN, usd: 0 }, per_tool: {} };
    expect(checkBudget(limits({}), bad, 'a').verdict).toBe('deny');
  });
});

describe('recordUsage', () => {
  it('does not mutate its input', () => {
    const u = recordUsage(EMPTY_USAGE, 'a', 1);
    expect(EMPTY_USAGE).toEqual({ run: { calls: 0, usd: 0 }, per_tool: {} });
    expect(u.per_tool['a']).toEqual({ calls: 1, usd: 1 });
  });
});
