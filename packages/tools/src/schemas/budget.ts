/**
 * Budget schemas — per-tool and per-run call and cost limits, and running usage.
 *
 * Why: a Worker stuck in a loop, or a metered tool called in earnest, can burn the whole
 *   run's money before any gate sees it. Limits sit at the tool boundary: a hard cap
 *   denies, a soft (rolling-window) cap forces an approval, and a missing counter is a
 *   denial rather than free spending. Limits are config-shaped, so they are validated
 *   here once (tool-system.md §11).
 *
 * Exports: BudgetCaps, BudgetLimits, BudgetCounter, BudgetUsage.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

const Count = z.number().int().nonnegative();
const Usd = z.number().nonnegative().finite();

/** `soft_*` forces an ask once reached; `max_*` denies once reached. All optional. */
export const BudgetCaps = z.object({
  max_calls: Count.optional(),
  max_usd: Usd.optional(),
  soft_calls: Count.optional(),
  soft_usd: Usd.optional(),
});
export type BudgetCaps = z.infer<typeof BudgetCaps>;

export const BudgetLimits = z.object({
  run: BudgetCaps.default({}),
  per_tool: z.record(z.string(), BudgetCaps).default({}),
});
export type BudgetLimits = z.infer<typeof BudgetLimits>;

export const BudgetCounter = z.object({ calls: Count, usd: Usd });
export type BudgetCounter = z.infer<typeof BudgetCounter>;

export const BudgetUsage = z.object({
  run: BudgetCounter,
  per_tool: z.record(z.string(), BudgetCounter),
});
export type BudgetUsage = z.infer<typeof BudgetUsage>;
