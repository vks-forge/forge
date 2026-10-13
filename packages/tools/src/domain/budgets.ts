/**
 * Per-tool and per-run call and cost budgets.
 *
 * Why: a Worker looping on a metered tool, or a model calling a tool thousands of times,
 *   burns money and time before any gate looks. The check sits at the tool boundary and
 *   is pure, so the dispatcher can ask "may this call proceed?" with the counters it
 *   already keeps. Hard caps deny; soft (rolling-window) caps force an approval; counters
 *   or estimates that are not sane numbers deny, because an unmeasurable spend is not a
 *   free one. Limits and usage are parsed with their zod schemas inside the check, so a
 *   hand-built or corrupt object denies instead of throwing or reading as free spending
 *   (tool-system.md §11).
 *
 * Exports: checkBudget(), recordUsage(), EMPTY_USAGE.
 * Depends on: schemas/budget, types/budgets. No IO.
 */

import {
  BudgetLimits as BudgetLimitsSchema,
  BudgetUsage as BudgetUsageSchema,
} from '#/schemas/budget.js';
import type {
  BudgetCaps,
  BudgetCounter,
  BudgetLimits,
  BudgetUsage,
} from '#/schemas/budget.js';
import type { BudgetVerdict } from '#/types/budgets.types.js';

export const EMPTY_USAGE: BudgetUsage = { run: { calls: 0, usd: 0 }, per_tool: {} };

/** Own property only: a tool named `constructor` must not read `Object.prototype`. */
const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

const sane = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0;

function over(
  caps: BudgetCaps | undefined,
  counter: BudgetCounter,
  usd: number,
  hard: boolean,
): 'calls' | 'usd' | null {
  if (!caps) return null;
  const maxCalls = hard ? caps.max_calls : caps.soft_calls;
  const maxUsd = hard ? caps.max_usd : caps.soft_usd;
  if (maxCalls !== undefined && counter.calls + 1 > maxCalls) return 'calls';
  if (maxUsd !== undefined && counter.usd + usd > maxUsd) return 'usd';
  return null;
}

/**
 * Judges the next call of `tool` (costing `estimatedUsd`) against the limits. The first
 * hard breach wins (tool before run), then the first soft breach, else `ok`.
 */
export function checkBudget(
  rawLimits: BudgetLimits,
  rawUsage: BudgetUsage,
  tool: string,
  estimatedUsd = 0,
): BudgetVerdict {
  // The caller's counters come from storage and config; parse them like any boundary input.
  const parsedLimits = BudgetLimitsSchema.safeParse(rawLimits);
  const parsedUsage = BudgetUsageSchema.safeParse(rawUsage);
  if (!parsedLimits.success || !parsedUsage.success || !sane(estimatedUsd)) {
    return { verdict: 'deny', scope: 'run', kind: 'invalid' };
  }
  const limits = parsedLimits.data;
  const usage = parsedUsage.data;
  const toolCounter = own(usage.per_tool, tool) ?? { calls: 0, usd: 0 };
  const run = usage.run;
  const toolCaps = own(limits.per_tool, tool);
  for (const hard of [true, false]) {
    const t = over(toolCaps, toolCounter, estimatedUsd, hard);
    if (t) return { verdict: hard ? 'deny' : 'ask', scope: 'tool', kind: t };
    const r = over(limits.run, run, estimatedUsd, hard);
    if (r) return { verdict: hard ? 'deny' : 'ask', scope: 'run', kind: r };
  }
  return { verdict: 'ok' };
}

/** Returns usage after one more call of `tool` costing `usd`; does not mutate its input. */
export function recordUsage(usage: BudgetUsage, tool: string, usd: number): BudgetUsage {
  const t = own(usage.per_tool, tool) ?? { calls: 0, usd: 0 };
  return {
    run: { calls: usage.run.calls + 1, usd: usage.run.usd + usd },
    per_tool: { ...usage.per_tool, [tool]: { calls: t.calls + 1, usd: t.usd + usd } },
  };
}
