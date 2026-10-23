/**
 * Shapes of the needs-you dock: what one waiting item looks like to the screen that draws it.
 *
 * Why: the Card page and the Ticket page both show everything that waits on the owner in one
 *   dock, one item at a time. The server sends items as data (`NeedsYouItem`); each page then
 *   attaches the handlers that make its buttons work. Naming the view shape once lets the dock
 *   component stay free of page logic and lets the pure rules (order, selection, which action
 *   is primary) be tested without a browser.
 *
 * Exports: DockActionId, DockActionPlan, DockActionView, DockView, DockReasonChips,
 *   WorkLayoutMode.
 * Depends on: @forge/core (types), react (types). Types only.
 */

import type { NeedsYouKind } from '@forge/core';
import type { ReactNode } from 'react';

/** What a dock button does. `open_ticket` is a link. */
export type DockActionId =
  | 'approve_plan'
  | 'request_changes'
  | 'start_planning'
  | 'retry_step'
  | 'raise_step_budget'
  | 'run_as_express'
  | 'open_ticket';

/** At most one primary and one secondary action per item. */
export interface DockActionPlan {
  readonly primary: DockActionId | null;
  readonly secondary: DockActionId | null;
}

/** One button of an item with its handler (or a link target). */
export interface DockActionView {
  readonly id: DockActionId;
  readonly label: string;
  readonly onRun?: () => void;
  /** Set for an action that is a link (settings, a ticket page). */
  readonly to?: string;
  readonly busy?: boolean;
  /** Marks a disclosure button that opens the body below. */
  readonly expanded?: boolean;
  /** Opens another dialog or page, so the modal gets out of the way when it is pressed. */
  readonly leaves?: boolean;
}

/** One waiting item, ready to draw. */
export interface DockView {
  readonly key: string;
  readonly kind: NeedsYouKind;
  readonly title: string;
  /** When the server raised it; the modal lists the newest first. */
  readonly raisedAt?: string;
  /** The separate reasons (floor reasons, questions) for the chips and the disclosure. */
  readonly reasons: readonly string[];
  readonly primary?: DockActionView;
  readonly secondary?: DockActionView;
  /** A quiet text link beside the actions, such as "Open the plan". */
  readonly link?: { readonly label: string; readonly onRun: () => void };
  /** Item-specific content under the title (a question with its options, an escalation card). */
  readonly body?: ReactNode;
  /** Why the last action on this item failed, in words. */
  readonly error?: string | null;
}

/** Reason chips: the first few, clipped, and whether the full list needs a disclosure. */
export interface DockReasonChips {
  readonly chips: readonly string[];
  readonly hidden: number;
  readonly needsDisclosure: boolean;
}

/** `rail` from 1280 px, `tabs` from 1024 to 1279 px, `sheet` below 1024 px. */
export type WorkLayoutMode = 'rail' | 'tabs' | 'sheet';
