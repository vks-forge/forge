/**
 * Shapes the hand-drawn charts and ranked lists take.
 *
 * Why: charts must tell "zero" from "no data", which a plain `number[]` cannot. A point
 *   with `value: null` is a day with nothing to report; the server's own series never contain
 *   one, but a series with unreported cost is mapped to null before it reaches the chart.
 *   Ranked lists (top tickets, harnesses) share one entry shape so every ranking reads alike.
 *
 * Exports: ChartPoint, RankEntry.
 * Depends on: react (type only).
 */

import type { ReactNode } from 'react';

export interface ChartPoint {
  /** UTC calendar day, `YYYY-MM-DD`. */
  readonly date: string;
  /** `null` means no data for that day, which is not the same as 0. */
  readonly value: number | null;
}

export interface RankEntry {
  readonly key: string;
  readonly title: ReactNode;
  readonly detail: ReactNode;
  /** Right-hand figure, already formatted. */
  readonly value: ReactNode;
  readonly to?: string;
}
