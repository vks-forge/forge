/**
 * The budget level a card without its own cap falls back to, read from settings.
 *
 * Why: a card's budget is its own cap, else the project's warning level, else the Forge default
 *   (core's `effectiveCardBudget`). The engine resolves the level from its settings snapshot; the Inbox,
 *   the card page and the card PATCH must resolve the same level from the settings the owner edits, or
 *   the page would say "No cap" while the engine warns against $5. This reads the two settings documents
 *   and names which one the level came from, so the screen can say "Forge default" or "this project" in
 *   plain words. It reads settings, never storage: callers read it before opening a storage transaction
 *   (settings and storage share one writer queue).
 *
 * Exports: budgetDefaultForProject(), budgetDefaultForCard().
 * Depends on: @forge/core (budgetDefaultFor, BUILTIN_DIRECTOR_CONFIG, ConfigSource), types/routes.
 *   IO: reads settings and, for a card, storage.
 */

import { BUILTIN_DIRECTOR_CONFIG, budgetDefaultFor } from '@forge/core';
import type { BudgetDefault, CardId } from '@forge/core';
import type { RouteDeps } from '#/types/routes.types.js';

/** The default level for `slug`; the built-in level when settings cannot be read (a heads-up must not fail a page). */
export async function budgetDefaultForProject(
  config: RouteDeps['config'],
  slug: string,
): Promise<BudgetDefault> {
  try {
    const [company, project] = await Promise.all([
      config.company(),
      config.project(slug),
    ]);

    return budgetDefaultFor({
      forge_usd: company.config.director.budget_warning_usd,
      project_usd: project.config.project.director?.budget_warning_usd,
    });
  } catch {
    return budgetDefaultFor({ forge_usd: BUILTIN_DIRECTOR_CONFIG.budget_warning_usd });
  }
}

/** The default level for the card's project; the built-in level when the card is not found. */
export async function budgetDefaultForCard(
  deps: RouteDeps,
  cardId: CardId,
): Promise<BudgetDefault> {
  const slug = await deps.storage.transaction(async (tx) => {
    const card = await tx.cards.get(cardId);

    return card ? ((await tx.projects.get(card.project))?.slug ?? card.project) : null;
  });

  return slug === null
    ? budgetDefaultFor({ forge_usd: BUILTIN_DIRECTOR_CONFIG.budget_warning_usd })
    : budgetDefaultForProject(deps.config, slug);
}
