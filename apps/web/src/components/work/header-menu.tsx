/**
 * HeaderMenu: the `⋯` menu of the Card and Ticket headers.
 *
 * Why: changing a card's type and closing it are rare and consequential, and they used to sit
 *   in the header row as a type dropdown that read like a phase and a red button that invited a
 *   slip. Behind one named menu button they stay reachable (each still asks first, in its own
 *   dialog) without competing with the title, the status and the cost. It opens with the
 *   keyboard, and its rows are real menu items; the row already in effect is checked and cannot
 *   be chosen.
 *
 * Exports: HeaderMenu.
 * Depends on: @radix-ui/react-dropdown-menu, lucide-react, types/work-header.types.
 */

import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, Ellipsis } from 'lucide-react';
import type { HeaderMenuEntry } from '#/types/work-header.types.js';

const ITEM =
  'flex min-h-10 cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[disabled]:opacity-60 data-[highlighted]:bg-hover';

export function HeaderMenu(props: {
  /** Accessible name of the trigger. */
  label: string;
  entries: readonly HeaderMenuEntry[];
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={props.label}
        className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-[background-color,transform] duration-150 hover:bg-hover hover:text-fg active:translate-y-px data-[state=open]:bg-hover"
      >
        <Ellipsis aria-hidden="true" className="size-5" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="z-[70] w-64 max-w-[calc(100vw-1rem)] rounded-xl border border-line bg-surface p-1 shadow-float"
        >
          {props.entries.map((entry) => {
            if (entry.kind === 'label') {
              return (
                <Menu.Label
                  key={entry.key}
                  className="px-2 pb-0.5 pt-1.5 text-xs text-muted"
                >
                  {entry.text}
                </Menu.Label>
              );
            }

            if (entry.kind === 'separator') {
              return <Menu.Separator key={entry.key} className="my-1 h-px bg-line" />;
            }

            return (
              <Menu.Item
                key={entry.key}
                disabled={entry.current === true}
                onSelect={entry.onSelect}
                className={`${ITEM} ${entry.tone === 'danger' ? 'text-danger' : ''}`}
              >
                <span className="grid size-4 shrink-0 place-items-center">
                  {entry.current ? <Check aria-hidden="true" className="size-4" /> : null}
                </span>
                <span className="min-w-0 break-words">{entry.label}</span>
              </Menu.Item>
            );
          })}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
