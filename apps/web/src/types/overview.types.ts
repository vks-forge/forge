/**
 * Shapes of the Overview dashboard: its request, its URL filters and the chart inputs.
 *
 * Why: the Overview's state lives in the URL (so a view can be shared) and its charts draw
 *   the same figures three ways (stacked bars, a donut, a sparkline). Naming the filter, the
 *   series and the computed bar geometry keeps the URL parsing, the layout maths and the
 *   components agreeing on one vocabulary, and lets the maths be tested without a DOM.
 *
 * Exports: OverviewRequest, OverviewFilters, OverviewChange, ChartSeries, DonutSlice, BarSegment, BucketBars,
 *   StackLayout, BarMode, DonutArc.
 * Depends on: @forge/core (types only). Types only.
 */

import type { StatsGroup, StatsRange } from '@forge/core';

/** What `GET /stats/overview` is asked; `group` undefined lets the server follow the range. */
export interface OverviewRequest {
  readonly range: StatsRange;
  readonly group: StatsGroup | undefined;
  readonly projects: readonly string[];
  readonly archived: boolean;
}

/** The Overview's filters as the URL holds them; `group` is the one in effect. */
export interface OverviewFilters {
  readonly range: StatsRange;
  readonly group: StatsGroup;
  /** True when the URL names a group, false when it follows the range. */
  readonly groupChosen: boolean;
  readonly projects: readonly string[];
  readonly archived: boolean;
}

/** One change to the filters; absent keys stay as they are. */
export interface OverviewChange {
  readonly range?: StatsRange;
  readonly group?: StatsGroup;
  readonly projects?: readonly string[];
  readonly archived?: boolean;
}

/** One series of a bucket chart; `color` is a CSS colour token such as `var(--series-1)`. */
export interface ChartSeries {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  /** One value per bucket. */
  readonly values: readonly number[];
}

/** One slice of a donut. */
export interface DonutSlice {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly color: string;
}

export type BarMode = 'stacked' | 'grouped';

/** A rectangle in the chart's viewBox units. */
export interface BarSegment {
  readonly series: string;
  readonly value: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BucketBars {
  readonly index: number;
  readonly total: number;
  readonly segments: readonly BarSegment[];
}

export interface StackLayout {
  /** Tallest bucket (stacked: the sum, grouped: the largest single value). */
  readonly max: number;
  readonly bars: readonly BucketBars[];
  readonly width: number;
  readonly height: number;
}

/** A donut slice as a share of the ring: `start` and `length` are in 0..100. */
export interface DonutArc {
  readonly key: string;
  readonly start: number;
  readonly length: number;
}
