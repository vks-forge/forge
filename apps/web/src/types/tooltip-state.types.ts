/**
 * Shapes of the Tooltip open-state hook.
 *
 * Why: the Tooltip owns its open flag instead of trusting the library, so the hook that does
 *   so hands the component a small bag: the flag, the Radix change handler that vets every
 *   open request, a callback ref for the trigger, and the event handlers that force it shut.
 *
 * Exports: TooltipState.
 * Depends on: react. Types only.
 */

import type { PointerEvent } from 'react';

export interface TooltipState {
  readonly open: boolean;
  /** Passed to Radix `onOpenChange`: opens only for hover or keyboard focus, always closes. */
  readonly onOpenChange: (next: boolean) => void;
  /** Callback ref for the trigger element. */
  readonly setTrigger: (element: HTMLElement | null) => void;
  /** Merged onto the trigger next to the child's own handlers. */
  readonly triggerProps: {
    readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    readonly onPointerLeave: () => void;
    readonly onClick: () => void;
    readonly onBlur: () => void;
    readonly onKeyDown: () => void;
  };
}
