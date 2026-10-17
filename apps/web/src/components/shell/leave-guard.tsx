/**
 * LeaveGuard: blocks navigation while a view holds unsaved edits and asks what to do.
 *
 * Why: switching project, or clicking any other screen, would silently throw away a form the
 *   user is halfway through (d-0104). The router blocks the navigation while any view reports
 *   unsaved changes (state/unsaved-changes.tsx), and this component shows an in-page alert,
 *   not a browser popup, with two plainly worded choices: "Keep editing" (the default, safest
 *   focus) or "Discard changes" (the navigation then continues). Choosing neither (Escape)
 *   means keep editing, because losing work must always be a deliberate act.
 *
 * Exports: LeaveGuard.
 * Depends on: react, react-router, @radix-ui/react-alert-dialog, motion/react,
 *   state/unsaved-changes, components/ui/button, theme/motion.
 */

import * as Alert from '@radix-ui/react-alert-dialog';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import { Button } from '#/components/ui/button.js';
import { useUnsavedChangesState } from '#/state/unsaved-changes.js';
import { popVariants } from '#/theme/motion.js';

export function LeaveGuard() {
  const { dirty, shouldBlock, pending, askToLeave, settle } = useUnsavedChangesState();

  const blocker = useBlocker(
    ({ nextLocation }) => dirty && shouldBlock(nextLocation.pathname),
  );

  useEffect(() => {
    if (blocker.state === 'blocked') {
      askToLeave({ proceed: () => blocker.proceed(), cancel: () => blocker.reset() });
    }
  }, [blocker, askToLeave]);

  return (
    <Alert.Root
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) {
          settle('keep');
        }
      }}
    >
      <AnimatePresence>
        {pending ? (
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
                  className="pointer-events-auto grid w-full max-w-sm gap-3 rounded-xl border border-line bg-surface p-5 shadow-float"
                >
                  <Alert.Title className="text-base font-semibold">
                    Discard unsaved changes?
                  </Alert.Title>
                  <Alert.Description className="text-sm text-muted">
                    This screen has edits that are not saved. If you leave now, they are
                    lost.
                  </Alert.Description>
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <Alert.Cancel asChild>
                      <Button variant="quiet">Keep editing</Button>
                    </Alert.Cancel>
                    <Alert.Action asChild>
                      <Button variant="danger" onClick={() => settle('discard')}>
                        Discard changes
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
