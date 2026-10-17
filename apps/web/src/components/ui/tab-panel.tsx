/**
 * TabPanel: the scrolling body under a routed tab strip.
 *
 * Why: the page frame holds its header and tab strip still while the panel below them
 *   scrolls, so the owner never loses the card's title, cost or tabs. The panel is its own
 *   scroll box (thin themed scrollbar) and remembers where it was per tab, so returning to a
 *   long plan lands where the reader left it. Panels that manage their own scrolling (the
 *   chat, whose list scrolls above a docked composer) pass `scroll={false}`.
 *
 * Exports: TabPanel.
 * Depends on: react, components/ui/scroll-area, state/use-scroll-memory, types/route-tabs.types.
 */

import { useRef } from 'react';
import type { ReactNode } from 'react';
import { ScrollArea } from '#/components/ui/scroll-area.js';
import { useRestoreScroll } from '#/state/use-scroll-memory.js';
import type { ScrollMemory } from '#/types/route-tabs.types.js';

export function TabPanel(props: {
  /** Matches the strip's `idPrefix`. */
  idPrefix: string;
  tab: string;
  memory: ScrollMemory;
  /** False when the content scrolls itself. */
  scroll?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const save = useRestoreScroll(ref, props.memory, props.tab);
  const common = {
    id: `${props.idPrefix}-panel`,
    role: 'tabpanel',
    'aria-labelledby': `${props.idPrefix}-tab-${props.tab}`,
  } as const;

  if (props.scroll === false) {
    return (
      <div {...common} className="flex min-h-0 flex-1 flex-col">
        {props.children}
      </div>
    );
  }

  return (
    <ScrollArea
      {...common}
      ref={ref}
      onScroll={save}
      className="min-h-0 flex-1 py-4 pr-1"
    >
      {props.children}
    </ScrollArea>
  );
}
