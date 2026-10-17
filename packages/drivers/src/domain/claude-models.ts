/**
 * The models the Claude harness offers, as the driver declares them.
 *
 * Why: the agent editor must offer the owner real choices ("Opus for reviews, Sonnet for
 *   code") with an honest speed and cost, and the Director's own model pickers read the same
 *   list. The `claude` CLI has no command that lists models, so the driver declares the
 *   aliases it accepts (`--model opus|sonnet|haiku` follow the newest build of each) and the
 *   compatibility check stores this list with its report. A custom id is always allowed in
 *   the editor for anything newer than this list.
 *
 * Exports: CLAUDE_MODELS.
 * Depends on: @forge/core (HarnessModel type). No IO.
 */

import type { HarnessModel } from '@forge/core';

export const CLAUDE_MODELS: readonly HarnessModel[] = [
  {
    id: 'opus',
    label: 'Claude Opus (deepest reasoning)',
    speed: 'deep',
    cost: 'high',
    recommended_for: ['reviewer', 'researcher'],
  },
  {
    id: 'sonnet',
    label: 'Claude Sonnet (balanced)',
    speed: 'balanced',
    cost: 'medium',
    recommended_for: ['writer', 'tester'],
  },
  {
    id: 'haiku',
    label: 'Claude Haiku (fastest, cheapest)',
    speed: 'fast',
    cost: 'low',
    recommended_for: ['tester', 'researcher'],
  },
];
