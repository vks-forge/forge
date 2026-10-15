/**
 * SideDrawer: a panel that slides in from the right for reading one thing in detail.
 *
 * Why: opening a memory record must not lose the user's place in a long filtered list. A
 *   drawer keeps the list visible behind a scrim (and its scroll position intact), is closed
 *   by Escape, the close button or a click outside, and returns focus to the row that opened
 *   it. On a phone it takes the full width. It slides with the `settle` spring and moves only
 *   `transform` and `opacity`.
 *
 * Exports: SideDrawer.
 * Depends on: @radix-ui/react-dialog, motion/react, lucide-react, theme/motion.
 */

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { springs } from '#/theme/motion.js';

export function SideDrawer(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Small line above the title, such as the record id. */
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <AnimatePresence>
        {props.open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay forceMount asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-40 bg-scrim"
              />
            </Dialog.Overlay>
            <Dialog.Content forceMount asChild aria-describedby={undefined}>
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={springs.settle}
                className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-surface shadow-float sm:w-[min(32rem,92vw)]"
              >
                <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
                  <div className="min-w-0">
                    {props.eyebrow ? (
                      <p className="font-data text-xs text-muted">{props.eyebrow}</p>
                    ) : null}
                    <Dialog.Title className="text-base font-semibold">
                      {props.title}
                    </Dialog.Title>
                  </div>
                  <Dialog.Close
                    aria-label="Close"
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-[background-color,transform] duration-150 hover:bg-hover active:translate-y-px"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </Dialog.Close>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  {props.children}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
