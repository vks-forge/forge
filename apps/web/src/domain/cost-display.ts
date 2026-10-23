/**
 * Cost display: how a card's, ticket's or run's dollars read on a header, tile or row.
 *
 * Why: the same figure appears on the Board tile, both page headers, the Cost and Overview
 *   screens and the breakdown tables, and it must read the same everywhere and never lie. One
 *   pattern everywhere: the total first, then the two sources in the same order, Workers then
 *   Director ("$24.29 · Workers $7.43 · Director $16.86"). A run whose harness reported no cost
 *   is "not recorded", not "$0.00" (that would read as free); a total is a floor (a harness that
 *   reports no price adds nothing), so the tooltip says so. Amounts come from `formatUsd`: two
 *   decimals from one cent up, `<$0.01` below it.
 *
 * Exports: costText(), recordedUsd(), cardCostSplit(), ticketCostSplit(), splitLine(),
 *   SPLIT_LABEL, COST_NOT_RECORDED, COST_FLOOR_NOTE.
 * Depends on: @forge/core (types), domain/stats-format. Pure.
 */

import type { CardCost, TicketCost } from '@forge/core';
import { formatUsd } from '#/domain/stats-format.js';

export const COST_NOT_RECORDED =
  'No cost was recorded for this (a harness that reports none, or nothing has run yet).';

export const COST_FLOOR_NOTE =
  'Workers write the code; the Director plans and answers. Only recorded cost is counted, so the real total can be higher.';

/** The two sources of every cost figure, in the one order they are always shown. */
export const SPLIT_LABEL = { workers: 'Workers', director: 'Director' } as const;

/** `Workers $7.43 · Director $16.86`: the same line on every screen that splits a total. */
export function splitLine(workersUsd: number, directorUsd: number): string {
  return `${SPLIT_LABEL.workers} ${formatUsd(workersUsd)} · ${SPLIT_LABEL.director} ${formatUsd(directorUsd)}`;
}

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

/** The Workers / Director split of a card cost as labelled lines for a tooltip. */
export function cardCostSplit(
  cost: Pick<CardCost, 'director_usd' | 'tickets_usd'>,
): readonly { label: string; text: string }[] {
  return [
    { label: SPLIT_LABEL.workers, text: costText(cost.tickets_usd) },
    { label: SPLIT_LABEL.director, text: costText(cost.director_usd) },
  ];
}

/** The same two lines for one ticket (its runs, and the Director's steps on it). */
export function ticketCostSplit(
  cost: Pick<TicketCost, 'workers_usd' | 'director_usd'>,
): readonly { label: string; text: string }[] {
  return [
    { label: SPLIT_LABEL.workers, text: costText(cost.workers_usd) },
    { label: SPLIT_LABEL.director, text: costText(cost.director_usd) },
  ];
}
