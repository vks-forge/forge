/**
 * useTooltipState: the open flag of a Tooltip, with every way to close it spelled out.
 *
 * Why: a tooltip that stays on screen after the pointer has left is the one bug users read as
 *   "broken app". Library-managed open state can stick when an exit animation never ends or
 *   when the trigger moves or unmounts under a still-hovering pointer (the flow editor's move
 *   buttons reorder rows on click). Here the flag is ours: it closes on pointer leave, press,
 *   click, blur, Escape, scroll, resize, tab hide, a pointer moving anywhere off the trigger,
 *   and the trigger leaving the document. A press opens nothing: focus that follows a mouse
 *   click is not keyboard intent, so only hover and keyboard focus may open it.
 *
 * Exports: useTooltipState().
 * Depends on: react, types/tooltip-state.types. Browser only (document, window).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TooltipState } from '#/types/tooltip-state.types.js';

const CONNECTED_POLL_MS = 200;

/** `:focus-visible` is the platform's "focus came from the keyboard"; old engines throw. */
function hasKeyboardFocus(element: HTMLElement): boolean {
  try {
    return element.matches(':focus-visible');
  } catch {
    return false;
  }
}

export function useTooltipState(): TooltipState {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  // True from a press until the pointer leaves, blur or a key: focus then is not keyboard intent.
  const pressedRef = useRef(false);

  const setTrigger = useCallback((element: HTMLElement | null) => {
    triggerRef.current = element;
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const onOpenChange = useCallback((next: boolean) => {
    if (next && pressedRef.current) {
      return;
    }

    setOpen(next);
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };

    const onPointerMove = (event: globalThis.PointerEvent) => {
      const trigger = triggerRef.current;

      // Keyboard-focused tooltips stay while the mouse wanders; hover ones follow the pointer.
      if (trigger && event.target instanceof Node && !trigger.contains(event.target)) {
        if (!hasKeyboardFocus(trigger)) {
          close();
        }
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        close();
      }
    };

    const poll = window.setInterval(() => {
      if (!triggerRef.current?.isConnected) {
        close();
      }
    }, CONNECTED_POLL_MS);

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close, true);

    return () => {
      window.clearInterval(poll);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close, true);
    };
  }, [open, close]);

  const triggerProps = useMemo(
    () => ({
      onPointerDown: () => {
        pressedRef.current = true;
        close();
      },
      onPointerLeave: () => {
        pressedRef.current = false;
        close();
      },
      onClick: close,
      onBlur: () => {
        pressedRef.current = false;
        close();
      },
      onKeyDown: () => {
        pressedRef.current = false;
      },
    }),
    [close],
  );

  return { open, onOpenChange, setTrigger, triggerProps };
}
