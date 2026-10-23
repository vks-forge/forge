/**
 * Turn limit — which limit a run was held to and where the owner raises it.
 *
 * Why: a Worker that used all its turns is fixed only by raising the limit that applied to it. That is the
 *   agent's own turn limit when it sets one, else the Forge-wide "Turns per run". The owner needs the number
 *   and the screen in the failure itself, or all they see is "ran out of turns" with no way to act. The rule
 *   mirrors the one the run request uses (`own.turns ?? engine.run_budget.max_turns`), so the message names
 *   the limit the run really had.
 *
 * Exports: turnLimitOf(), FORGE_TURNS_HREF, AGENTS_HREF.
 * Depends on: @forge/core (EscalationFailure type). No IO.
 */

import type { EscalationFailure } from '@forge/core';

/** Forge settings, Limits, the "Turns per run" card. */
export const FORGE_TURNS_HREF = '/settings/limits#spend';

/** Forge settings, Agents: where an agent's own Budget lives (the screen has no per-agent link). */
export const AGENTS_HREF = '/settings/agents';

/** The limit a run had: the agent's own turns when set, else the Forge-wide value. */
export function turnLimitOf(
  agentTurns: number | undefined,
  forgeTurns: number,
): NonNullable<EscalationFailure['limit']> {
  return agentTurns === undefined
    ? { kind: 'turns', value: forgeTurns, source: 'forge', fix_href: FORGE_TURNS_HREF }
    : { kind: 'turns', value: agentTurns, source: 'agent', fix_href: AGENTS_HREF };
}
