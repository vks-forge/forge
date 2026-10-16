/**
 * Modal: a centred dialog for a short task that must be finished or abandoned on purpose.
 *
 * Why: setup forms (add a GitHub connection, paste a credential) hold a private key or a long
 *   value that is painful to retype. A click that lands on the dimmed page behind must never
 *   throw that work away, so the backdrop is inert: the dialog closes only through Cancel, the
 *   close button or Escape. When the form holds edits, all three first ask "Discard this?" so
 *   leaving is always a decision. While the request is in flight closing is blocked, so the
 *   user cannot walk away from a half-sent write. Focus is trapped inside and handed back to
 *   the button that opened it. Unlike the side drawer this one blocks the page behind it.
 *
 * Exports: Modal. `size="large"` and `subheader` serve multi-step dialogs such as add project.
 * Depends on: @radix-ui/react-dialog, motion/react, lucide-react, components/ui/button,
 *   components/ui/confirm-dialog, theme/motion.
 */

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '#/components/ui/button.js';
import { ConfirmDialog } from '#/components/ui/confirm-dialog.js';
import { popVariants } from '#/theme/motion.js';

export function Modal(props: {
  open: boolean;
  /** Called once leaving is allowed: clean, or the user chose to discard. */
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
  /** The primary action, usually a submit button tied to the form by its `form` attribute. */
  primary: ReactNode;
  /** The form holds edits, so leaving asks first. */
  dirty?: boolean;
  /** A request is in flight, so leaving is blocked. */
  busy?: boolean;
  discardTitle?: string;
  discardDescription?: string;
  /** `large` is a wide, tall dialog for multi-step forms; its height stays put between steps. */
  size?: 'default' | 'large';
  /** Pinned under the title, above the scrolling body (a step indicator). */
  subheader?: ReactNode;
}) {
  const { open, onClose, dirty = false, busy = false, size = 'default' } = props;
  const [asking, setAsking] = useState(false);
  // Radix only restores focus to a Dialog.Trigger, and this modal is opened by any button.
  const opener = useRef<HTMLElement | null>(null);

  const requestClose = (): void => {
    if (busy) {
      return;
    }

    if (dirty) {
      setAsking(true);

      return;
    }

    onClose();
  };

  return (
    <>
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            requestClose();
          }
        }}
      >
        <AnimatePresence>
          {open ? (
            <Dialog.Portal forceMount>
              <Dialog.Overlay forceMount asChild>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="fixed inset-0 z-50 bg-scrim"
                />
              </Dialog.Overlay>
              <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
                <Dialog.Content
                  forceMount
                  asChild
                  onOpenAutoFocus={() => {
                    opener.current = document.activeElement as HTMLElement | null;
                  }}
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    opener.current?.focus();
                  }}
                  onPointerDownOutside={(event) => event.preventDefault()}
                  onInteractOutside={(event) => event.preventDefault()}
                  onEscapeKeyDown={(event) => {
                    if (busy) {
                      event.preventDefault();
                    }
                  }}
                >
                  <motion.div
                    variants={popVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className={`pointer-events-auto flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-float ${
                      size === 'large'
                        ? 'h-[min(46rem,calc(100dvh-2rem))] max-w-3xl'
                        : 'max-w-lg'
                    }`}
                  >
                    <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
                      <div className="grid min-w-0 gap-1">
                        <Dialog.Title className="text-base font-semibold">
                          {props.title}
                        </Dialog.Title>
                        <Dialog.Description className="text-sm text-muted">
                          {props.description}
                        </Dialog.Description>
                      </div>
                      <button
                        type="button"
                        aria-label="Close"
                        disabled={busy}
                        onClick={requestClose}
                        className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-[background-color,transform] duration-150 hover:bg-hover active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <X aria-hidden="true" className="size-4" />
                      </button>
                    </header>
                    {props.subheader ? (
                      <div className="border-b border-line px-5 py-3">
                        {props.subheader}
                      </div>
                    ) : null}
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                      {props.children}
                    </div>
                    <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-rail px-5 py-3">
                      <Button disabled={busy} onClick={requestClose}>
                        Cancel
                      </Button>
                      {props.primary}
                    </footer>
                  </motion.div>
                </Dialog.Content>
              </div>
            </Dialog.Portal>
          ) : null}
        </AnimatePresence>
      </Dialog.Root>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={props.discardTitle ?? 'Discard your changes?'}
        description={
          props.discardDescription ??
          'What you entered here will be lost. This cannot be undone.'
        }
        confirmLabel="Discard"
        tone="danger"
        onConfirm={() => {
          setAsking(false);
          onClose();
        }}
      />
    </>
  );
}
