/**
 * effectiveCardBudget: the one answer to "what budget is this card held to?".
 *
 * Why: a card's budget is a heads-up, never a stop (d-0143), and three places must agree on its
 *   number: the engine that writes the 80% and 100% warnings, the Inbox that lists them, and the
 *   card's Details that tells the owner. They used to disagree: the engine fell back to the
 *   Director's warning level ($5), the Details row read only the card's own cap and printed "No cap",
 *   and two engine paths passed no fallback and never warned. One pure function answers it: the card's
 *   own cap wins, else the project's own warning level, else the Forge default, and says which one it
 *   was so the screen can name it in plain words. A cap of zero means "no budget" and yields a null cap.
 *
 * Exports: effectiveCardBudget(), budgetDefaultFor().
 * Depends on: types/card-budget.types. No IO.
 */

import type {
  BudgetDefault,
  BudgetLevels,
  BudgetSource,
  CardBudget,
} from '#/types/card-budget.types.js';

/** The default level for a project: its own override when it has one, else the Forge default. */
export function budgetDefaultFor(levels: BudgetLevels): BudgetDefault {
  return levels.project_usd === undefined
    ? { usd: levels.forge_usd, source: 'forge' }
    : { usd: levels.project_usd, source: 'project' };
}

/** The card's own cap when it set one, else the project's level, else the Forge default. */
export function effectiveCardBudget(
  card: { readonly budget_cap_usd?: number | undefined },
  fallback: BudgetDefault,
): CardBudget {
  const own = card.budget_cap_usd;
  const cap = own ?? fallback.usd;
  const source: BudgetSource = own === undefined ? fallback.source : 'card';

  return { cap_usd: cap > 0 ? cap : null, source };
}
