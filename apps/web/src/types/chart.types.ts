/**
 * Shapes the hand-drawn charts and ranked lists take.
 *
 * Why: charts must tell "zero" from "no data", which a plain `number[]` cannot. A point
 *   with `value: null` is a day with nothing to report; the server's own series never contain
 *   one, but a series with unreported cost is mapped to null before it reaches the chart.
 *   Ranked lists (top tickets, harnesses) share one entry shape so every ranking reads alike.
 *
 * Exports: CostTable, CostPagingState, RovingSlots, ChartPoint, ChartPart, RankEntry.
 * Depends on: react (type only).
 */

import type { ReactNode } from 'react';

export interface ChartPoint {
  /** UTC calendar day, `YYYY-MM-DD`. */
  readonly date: string;
  /** `null` means no data for that day, which is not the same as 0. */
  readonly value: number | null;
  /** The day's total split by series, bottom first, in the order of the chart's `parts`; they add up to `value`. */
  readonly parts?: readonly number[];
}

/** One series of a split bar chart: its written name and the colour token that draws it. */
export interface ChartPart {
  readonly key: string;
  readonly label: string;
  readonly color: string;
}

export interface RankEntry {
  readonly key: string;
  readonly title: ReactNode;
  readonly detail: ReactNode;
  /** Right-hand figure, already formatted. */
  readonly value: ReactNode;
  readonly to?: string;
}

/** What a chart needs to make its bars one roving keyboard stop. */
export interface RovingSlots {
  readonly attach: (node: SVGSVGElement | null) => void;
  /** Index of the bar that holds `tabIndex=0`. */
  readonly active: number;
  readonly setActive: (index: number) => void;
}

/** The two ranked tables of the Cost screen; each pages on its own. */
export type CostTable = 'ticket' | 'run';

export interface CostPagingState {
  readonly range: string;
  readonly ticket: { readonly limit: number; readonly offset: number };
  readonly run: { readonly limit: number; readonly offset: number };
}
