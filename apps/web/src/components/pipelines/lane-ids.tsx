/**
 * Lane ids: DOM ids that stay unique when three lanes are on the page at once.
 *
 * Why: the pipelines screen keeps all three lane panes mounted (so an unsaved edit survives
 *   looking at another lane) and only hides the ones not shown. Express and Standard both have a
 *   stage called `implementer`, so ids built from the stage id alone would repeat, and a label's
 *   `for` can then point at a field in a hidden pane. Each pane wraps its content in a provider
 *   that names its lane, and every id a stage control builds goes through `useLaneId()`.
 *
 * Exports: LaneIdProvider, useLaneId().
 * Depends on: react.
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

const LaneContext = createContext('');

export function LaneIdProvider(props: { lane: string; children: ReactNode }) {
  return <LaneContext.Provider value={props.lane}>{props.children}</LaneContext.Provider>;
}

/** `base`, prefixed with the lane of the pane it is rendered in. */
export function useLaneId(base: string): string {
  const lane = useContext(LaneContext);

  return lane === '' ? base : `${lane}-${base}`;
}
