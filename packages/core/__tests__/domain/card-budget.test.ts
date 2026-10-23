/**
 * Pins the one budget answer every screen and warning shares.
 *
 * Why: the engine warned against a $5 default, the card's Details said "No cap" and two engine paths
 *   never warned at all, because each place worked out the budget itself. The owner could be told "80% of
 *   $5" about a card whose page said it had no budget. These cases fix the order (card, then project, then
 *   Forge) and that the answer names its source so the page can say "Forge default" in plain words.
 *
 * Pins: a card's own cap wins over any default, a project level beats the Forge level, the source is
 *   reported for each, and a zero cap or zero default means no budget applies (null).
 * Depends on: src/domain/card-budget. No IO.
 */

import { describe, expect, it } from 'vitest';
import { budgetDefaultFor, effectiveCardBudget } from '#/domain/card-budget.js';

describe('budgetDefaultFor', () => {
  it('uses the project level when the project set one, else the Forge level', () => {
    expect(budgetDefaultFor({ forge_usd: 5 })).toEqual({ usd: 5, source: 'forge' });
    expect(budgetDefaultFor({ forge_usd: 5, project_usd: 12 })).toEqual({
      usd: 12,
      source: 'project',
    });
  });
});

describe('effectiveCardBudget', () => {
  const forge = budgetDefaultFor({ forge_usd: 5 });
  const project = budgetDefaultFor({ forge_usd: 5, project_usd: 12 });

  it('lets the card own cap win over every default', () => {
    expect(effectiveCardBudget({ budget_cap_usd: 3 }, project)).toEqual({
      cap_usd: 3,
      source: 'card',
    });
  });

  it('falls back to the project level, then to the Forge default, and names which', () => {
    expect(effectiveCardBudget({}, project)).toEqual({ cap_usd: 12, source: 'project' });
    expect(effectiveCardBudget({}, forge)).toEqual({ cap_usd: 5, source: 'forge' });
  });

  it('reports no cap when the card says zero or the default is zero', () => {
    expect(effectiveCardBudget({ budget_cap_usd: 0 }, forge)).toEqual({
      cap_usd: null,
      source: 'card',
    });

    expect(effectiveCardBudget({}, { usd: 0, source: 'forge' })).toEqual({
      cap_usd: null,
      source: 'forge',
    });
  });
});
