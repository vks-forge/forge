/**
 * LaneTabs: the Express / Standard / Full tab strip of the pipelines screen.
 *
 * Why: the three lanes are siblings the owner compares and edits one at a time, and each keeps
 *   its own unsaved list, so switching lane must never drop an edit. The tabs therefore only
 *   choose which panel is shown (the panels stay mounted, hidden), and they follow the ARIA tabs
 *   pattern: one tab stop, Left and Right (Home, End) move between tabs and open them. The
 *   chosen lane is kept in the URL (`?lane=full`) by the caller, so a link can open one lane.
 *
 * Exports: LaneTabs.
 * Depends on: react, domain/pipeline-copy, @forge/core (types).
 */

import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { Lane } from '@forge/core';
import { LANE_LABEL, LANE_ORDER } from '#/domain/pipeline-copy.js';

export const laneTabId = (lane: Lane): string => `lane-tab-${lane}`;
export const lanePanelId = (lane: Lane): string => `lane-panel-${lane}`;

export function LaneTabs(props: { active: Lane; onChange: (lane: Lane) => void }) {
  const refs = useRef(new Map<Lane, HTMLButtonElement>());

  function move(event: KeyboardEvent, from: number): void {
    const last = LANE_ORDER.length - 1;
    const jump: Record<string, number> = {
      ArrowRight: from === last ? 0 : from + 1,
      ArrowLeft: from === 0 ? last : from - 1,
      Home: 0,
      End: last,
    };

    const to = jump[event.key];
    const next = to === undefined ? undefined : LANE_ORDER[to];

    if (next === undefined) {
      return;
    }

    event.preventDefault();
    props.onChange(next);
    refs.current.get(next)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Lane"
      className="flex gap-1 overflow-x-auto border-b border-line"
    >
      {LANE_ORDER.map((lane, index) => {
        const active = lane === props.active;

        return (
          <button
            key={lane}
            ref={(node) => {
              if (node) {
                refs.current.set(lane, node);
              }
            }}
            type="button"
            role="tab"
            id={laneTabId(lane)}
            aria-selected={active}
            aria-controls={lanePanelId(lane)}
            tabIndex={active ? 0 : -1}
            onClick={() => props.onChange(lane)}
            onKeyDown={(event) => move(event, index)}
            className={`relative inline-flex min-h-11 items-center whitespace-nowrap px-3 text-sm font-medium transition-colors duration-150 ${
              active ? 'text-fg' : 'text-muted hover:text-fg'
            }`}
          >
            {LANE_LABEL[lane]}
            {active ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-signal"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
