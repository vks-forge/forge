/**
 * Toast: a short message at the bottom of the screen, with an optional action such as Undo.
 *
 * Why: archiving from the Inbox is instant and has no confirm dialog; the safety net is a
 *   few seconds to say "undo" (user control and freedom), and a failed write must say that
 *   the list was put back. A success toast that offers Undo clears itself after eight seconds;
 *   an error stays until dismissed because the user may be looking elsewhere. Errors are
 *   announced assertively, the rest politely. It rises with a spring on `transform` and
 *   `opacity` only, and sits clear of the 375 px edges.
 *
 * Exports: Toast.
 * Depends on: react, motion/react, lucide-react, components/ui/button, theme/motion.
 */

import { CircleAlert, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect } from 'react';
import { Button } from '#/components/ui/button.js';
import { springs } from '#/theme/motion.js';

const AUTO_DISMISS_MS = 8000;

export function Toast(props: {
  message: string;
  tone: 'info' | 'error';
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
}) {
  const { onDismiss, tone } = props;

  useEffect(() => {
    if (tone === 'error') {
      return undefined;
    }

    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);

    return () => clearTimeout(timer);
  }, [tone, onDismiss, props.message]);

  return (
    <motion.div
      role={tone === 'error' ? 'alert' : 'status'}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={springs.smooth}
      className={`fixed bottom-4 left-1/2 z-50 flex w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-xl border bg-surface px-4 py-3 text-sm shadow-float ${
        tone === 'error' ? 'border-danger' : 'border-line'
      }`}
    >
      {tone === 'error' ? (
        <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-danger" />
      ) : null}
      <span className="min-w-0 flex-1">{props.message}</span>
      {props.actionLabel && props.onAction ? (
        <Button variant="quiet" onClick={props.onAction}>
          {props.actionLabel}
        </Button>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </motion.div>
  );
}
