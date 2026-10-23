/**
 * ConfirmDialog: one "are you sure?" for actions that cannot be undone.
 *
 * Why: archiving a project, approving a proposal (it becomes a standing constraint on the
 *   Director) and rejecting one (it is written into memory with a reason) have no undo in the
 *   API, so the user must be asked first, in words that say what will happen and which way is
 *   the safe one. Escape and "Cancel" always leave; the action button names the act ("Archive
 *   project", never "OK") and is the only red or blue thing in the dialog. Focus is trapped
 *   and restored by Radix. The dialog can carry a form (a rejection reason) as children. When the
 *   act is itself a cancel, the leave-it-alone button gets its own words ("Keep running") so
 *   two buttons are never both called Cancel.
 *
 * Exports: ConfirmDialog.
 * Depends on: @radix-ui/react-alert-dialog, motion/react, components/ui/button, theme/motion.
 */

import * as Alert from '@radix-ui/react-alert-dialog';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Button } from '#/components/ui/button.js';
import { popVariants } from '#/theme/motion.js';

export function ConfirmDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  /** The leave-it-alone button's words; "Cancel" unless the act itself is a cancel ("Keep running"). */
  cancelLabel?: string;
  /** Holds the confirm button, for a form that is not yet valid. */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  const { open, onOpenChange, tone = 'primary' } = props;

  return (
    <Alert.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <Alert.Portal forceMount>
            <Alert.Overlay forceMount asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-50 bg-scrim"
              />
            </Alert.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
              <Alert.Content forceMount asChild>
                <motion.div
                  variants={popVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="pointer-events-auto grid w-full max-w-md gap-3 rounded-xl border border-line bg-surface p-5 shadow-float"
                >
                  <Alert.Title className="text-base font-semibold">
                    {props.title}
                  </Alert.Title>
                  <Alert.Description className="text-sm text-muted">
                    {props.description}
                  </Alert.Description>
                  {props.children}
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <Alert.Cancel asChild>
                      <Button variant="quiet">{props.cancelLabel ?? 'Cancel'}</Button>
                    </Alert.Cancel>
                    <Alert.Action asChild>
                      <Button
                        variant={tone}
                        disabled={props.confirmDisabled}
                        onClick={props.onConfirm}
                      >
                        {props.confirmLabel}
                      </Button>
                    </Alert.Action>
                  </div>
                </motion.div>
              </Alert.Content>
            </div>
          </Alert.Portal>
        ) : null}
      </AnimatePresence>
    </Alert.Root>
  );
}
