/**
 * Cost display: how a card's, ticket's or run's dollars read on a header, tile or row.
 *
 * Why: the same figure appears on the Board tile, both page headers and the breakdown tables,
 *   and it must read the same everywhere and never lie. A run whose harness reported no cost
 *   is "not recorded", not "$0.00" (that would read as free); the card total is a floor (the
 *   Director's triage and steering steps are not counted), so the tooltip says so. Amounts
 *   come from `formatUsd`: two decimals from one cent up, `<$0.01` below it.
 *
 * Exports: costText(), recordedUsd(), cardCostSplit(), COST_NOT_RECORDED, COST_FLOOR_NOTE.
 * Depends on: @forge/core (types), domain/stats-format. Pure.
 */

import type { CardCost } from '@forge/core';
import { formatUsd } from '#/domain/stats-format.js';

export const COST_NOT_RECORDED =
  'No cost was recorded for this (a harness that reports none, or nothing has run yet).';

export const COST_FLOOR_NOTE =
  'Only recorded cost is counted, so the real total can be higher.';

/** `$0.42`, `<$0.01`, or a dash when the value is missing or `recorded` is false. */
export function costText(usd: number | null | undefined, recorded = true): string {
  return recorded ? formatUsd(usd) : '—';
}

/** The run's dollars when the harness reported them, else undefined (never a made-up 0). */
export function recordedUsd(run: {
  readonly usd?: number | undefined;
  readonly recorded?: boolean | undefined;
}): number | undefined {
  return run.recorded === false ? undefined : run.usd;
}

/** The Director / tickets split of a card cost as labelled lines for a tooltip. */
export function cardCostSplit(
  cost: Pick<CardCost, 'director_usd' | 'tickets_usd'>,
): readonly { label: string; text: string }[] {
  return [
    { label: 'Director', text: costText(cost.director_usd) },
    { label: 'Tickets', text: costText(cost.tickets_usd) },
  ];
}
