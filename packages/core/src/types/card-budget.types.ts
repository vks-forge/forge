/**
 * Card budget types: the level a card falls back to and the budget it is held to.
 *
 * Why: the engine's warnings, the Inbox and the card page must all speak about one budget. These
 *   shapes carry the answer and, with it, whose number it is (the card's own, the project's or the
 *   Forge default), so a screen can say so in plain words instead of printing "No cap".
 *
 * Exports: BudgetSource, BudgetDefault, BudgetLevels, CardBudget.
 * Depends on: nothing. Types only.
 */

export type BudgetSource = 'card' | 'project' | 'forge';

/** The warning level a card without its own cap falls back to, and where that level came from. */
export interface BudgetDefault {
  readonly usd: number;
  readonly source: 'project' | 'forge';
}

/** The warning levels settings hold: the Forge default and, when the project set one, its own. */
export interface BudgetLevels {
  readonly forge_usd: number;
  readonly project_usd?: number | undefined;
}

/** What a card is held to: `cap_usd` is null when no budget applies. */
export interface CardBudget {
  readonly cap_usd: number | null;
  readonly source: BudgetSource;
}
