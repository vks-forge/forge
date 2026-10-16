/**
 * FolderToolbar: Up, the current path, the sort menu and "New folder" above the folder list.
 *
 * Why: walking the disk needs four things always in reach: go up, know where you are, order
 *   the list the way you look for things (by name or by date modified, either direction), and
 *   make a folder when the one you need does not exist yet. The path is plain text that wraps,
 *   never an input, so it can be read and (with the list's select-none) never half-highlighted
 *   by a double-click. New folder is off while the list shows the drives, where there is no
 *   place to put one.
 *
 * Exports: FolderToolbar.
 * Depends on: @radix-ui/react-dropdown-menu, lucide-react, motion/react, components/ui/button,
 *   domain/folder-sort, theme/motion, types/onboarding.types.
 */

import * as Menu from '@radix-ui/react-dropdown-menu';
import { ArrowDownUp, Check, CornerLeftUp, FolderPlus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Button } from '#/components/ui/button.js';
import { FOLDER_SORTS } from '#/domain/folder-sort.js';
import { popVariants } from '#/theme/motion.js';
import type { FolderSort } from '#/types/onboarding.types.js';

const ROW =
  'flex min-h-9 cursor-default select-none items-center gap-2 rounded-md px-2 text-sm outline-none data-[highlighted]:bg-hover';

export function FolderToolbar(props: {
  /** Text for the current place: a folder path, "This computer", or "Could not open". */
  where: string;
  canGoUp: boolean;
  onUp: () => void;
  sort: FolderSort;
  onSort: (sort: FolderSort) => void;
  canCreate: boolean;
  onNewFolder: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={props.onUp} disabled={!props.canGoUp} aria-label="Up one folder">
          <CornerLeftUp aria-hidden="true" className="size-4" />
          Up
        </Button>
        <Menu.Root open={open} onOpenChange={setOpen}>
          <Menu.Trigger asChild>
            <Button aria-label="Sort folders">
              <ArrowDownUp aria-hidden="true" className="size-4" />
              Sort
            </Button>
          </Menu.Trigger>
          <AnimatePresence>
            {open ? (
              <Menu.Portal forceMount>
                <Menu.Content forceMount asChild align="start" sideOffset={6}>
                  <motion.div
                    variants={popVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    style={{
                      transformOrigin:
                        'var(--radix-dropdown-menu-content-transform-origin)',
                    }}
                    className="z-[70] min-w-60 rounded-xl border border-line bg-surface p-1.5 shadow-float"
                  >
                    <Menu.RadioGroup
                      value={props.sort}
                      onValueChange={(value) => props.onSort(value as FolderSort)}
                    >
                      {FOLDER_SORTS.map((option) => (
                        <Menu.RadioItem
                          key={option.value}
                          value={option.value}
                          className={ROW}
                        >
                          <span className="w-4">
                            <Menu.ItemIndicator>
                              <Check aria-hidden="true" className="size-4 text-signal" />
                            </Menu.ItemIndicator>
                          </span>
                          {option.label}
                        </Menu.RadioItem>
                      ))}
                    </Menu.RadioGroup>
                  </motion.div>
                </Menu.Content>
              </Menu.Portal>
            ) : null}
          </AnimatePresence>
        </Menu.Root>
        <Button onClick={props.onNewFolder} disabled={!props.canCreate}>
          <FolderPlus aria-hidden="true" className="size-4" />
          New folder
        </Button>
      </div>
      <p
        aria-live="polite"
        className="min-w-0 select-none break-all rounded-lg bg-hover px-3 py-2 font-data text-xs leading-5"
      >
        {props.where}
      </p>
    </div>
  );
}
