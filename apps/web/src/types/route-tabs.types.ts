/**
 * Shapes of URL-driven tabs and the scroll positions they remember.
 *
 * Why: the Card and Ticket pages are one frame with several views, and the view is a path
 *   segment so a link, a refresh and Back all land on the right one. Both pages feed the same
 *   tab strip and the same per-tab scroll memory, so the shapes are named once here.
 *
 * Exports: RouteTab, ScrollMemory, TicketTab.
 * Depends on: react. Types only.
 */

import type { ReactNode } from 'react';

/** One tab of a routed tab strip. */
export interface RouteTab {
  readonly id: string;
  readonly label: string;
  /** Where the tab's link goes (path plus any query to keep). */
  readonly to: string;
  /** A small count after the label (the number of tickets). */
  readonly count?: number;
  /** Highlights the count or dot amber: something here waits on the owner. */
  readonly attention?: boolean;
  /** Spoken name when the visible label alone would hide the signal. */
  readonly ariaLabel?: string;
  /** Extra mark after the label, such as the "plan ready" dot. */
  readonly mark?: ReactNode;
}

/** Scroll position per tab, kept by the page for as long as it is open. */
export type ScrollMemory = Map<string, number>;

export type TicketTab = 'conversation' | 'review' | 'runs' | 'details';
