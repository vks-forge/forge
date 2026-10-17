/**
 * Tooltip: a small label that names an icon-only control on hover and keyboard focus.
 *
 * Why: the native `title` attribute is slow, unstyled, invisible to keyboard users and
 *   absent on touch. Icon buttons (archive, dismiss, close, theme) are only understood once
 *   named, so this shows the name after a short hover delay or at once on focus, positioned
 *   clear of screen edges, above modals (z-[80]) and notifications (z-[70]). It supplements
 *   the button's `aria-label` and never replaces it: assistive tech reads the label, the
 *   tooltip is for sighted users. A disabled button fires no pointer events, so to explain a
 *   disabled control wrap it in a `<span>` and put the Tooltip on the span. A tooltip must
 *   never stick: Radix keeps closed content mounted until an exit animation ends, and its
 *   own open state misses triggers that move or unmount under the pointer. So Radix only
 *   places and labels it; the open flag is ours (use-tooltip-state), content is mounted only
 *   while open, and closing is an immediate unmount that depends on no CSS. The entrance
 *   fade is a pure keyframe, skipped under reduced motion.
 *
 * Exports: Tooltip, TooltipProvider.
 * Depends on: @radix-ui/react-tooltip, react, ui/use-tooltip-state, types/tooltip.types,
 *   theme/app.css (tooltip-in).
 */

import * as Radix from '@radix-ui/react-tooltip';
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useTooltipState } from '#/components/ui/use-tooltip-state.js';
import type { TooltipProps } from '#/types/tooltip.types.js';

const HasProvider = createContext(false);

/** Mount once near the root: shares the open delay so moving between buttons feels instant. */
export function TooltipProvider(props: { children: ReactNode }) {
  return (
    <HasProvider.Provider value>
      <Radix.Provider delayDuration={400} skipDelayDuration={200}>
        {props.children}
      </Radix.Provider>
    </HasProvider.Provider>
  );
}

export function Tooltip(props: TooltipProps) {
  const hasProvider = useContext(HasProvider);
  const { content, side = 'top', align = 'center', shortcut, disabled = false } = props;

  const { open, onOpenChange, setTrigger, triggerProps } = useTooltipState();

  if (disabled) {
    return props.children;
  }

  // Content exists only while `open`; forceMount stops Radix Presence from deferring
  // the unmount to an exit animation, so closing is immediate whatever the CSS does.
  const tip = (
    <Radix.Root open={open} onOpenChange={onOpenChange}>
      <Radix.Trigger asChild ref={setTrigger} {...triggerProps}>
        {props.children}
      </Radix.Trigger>
      {open ? (
        <Radix.Portal forceMount>
          <Radix.Content
            forceMount
            side={side}
            align={align}
            sideOffset={6}
            collisionPadding={8}
            className="z-[80] flex max-w-60 origin-(--radix-tooltip-content-transform-origin) items-center gap-2 rounded-md bg-fg px-2 py-1 text-xs leading-4 text-bg shadow-float motion-safe:animate-[tooltip-in_120ms_ease-out]"
          >
            <span className="min-w-0 wrap-break-word">{content}</span>
            {shortcut ? (
              <kbd className="rounded-sm bg-bg/20 px-1 font-data text-[0.6875rem] leading-4">
                {shortcut}
              </kbd>
            ) : null}
            <Radix.Arrow width={10} height={5} className="fill-fg" />
          </Radix.Content>
        </Radix.Portal>
      ) : null}
    </Radix.Root>
  );

  // Components rendered outside AppProviders (isolated tests) still work: own provider.
  return hasProvider ? tip : <Radix.Provider>{tip}</Radix.Provider>;
}
