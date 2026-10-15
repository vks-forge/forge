/**
 * MobileDrawer: the sidebar as a slide-in panel on phones and narrow windows.
 *
 * Why: below 768 px a permanent 256 px column would leave no room for the screen itself, and
 *   a layout that scrolls sideways is not acceptable at 320 px. The same sidebar content
 *   slides in from the left over a dimmed page. It is a real modal dialog (Radix): focus moves
 *   into it and is trapped, Escape and a tap on the dimmed area close it, and focus returns
 *   to the menu button. It slides with a critically damped spring on `transform` only.
 *
 * Exports: MobileDrawer.
 * Depends on: @radix-ui/react-dialog, motion/react, components/shell/sidebar-content, theme/motion.
 */

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { SidebarContent } from '#/components/shell/sidebar-content.js';
import { springs } from '#/theme/motion.js';

export function MobileDrawer(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={springs.settle}
                className="fixed inset-y-0 left-0 z-50 w-[min(18rem,85vw)] border-r border-line bg-rail shadow-float"
              >
                <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                <Dialog.Close
                  aria-label="Close navigation"
                  className="absolute right-2 top-2 z-10 grid size-9 place-items-center rounded-lg text-muted transition-[background-color,transform] duration-150 hover:bg-hover active:translate-y-px"
                >
                  <X aria-hidden="true" className="size-4" />
                </Dialog.Close>
                <SidebarContent />
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
