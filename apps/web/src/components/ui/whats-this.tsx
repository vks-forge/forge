/**
 * WhatsThis: the one "what's this" help pattern, a small `?` button that opens a short plain
 * explanation of a term.
 *
 * Why: the owner does not code, and a term such as "Independent check" or "Care level" is only
 *   useful once explained. A hover-only hint is out of reach by touch and unreliable by
 *   keyboard, so this is a button that opens a popover: it works with a tap, Enter or Space,
 *   Esc closes it and returns focus to the button. The text comes from the glossary
 *   (domain/plain-words), so every screen explains a term in the same words. Place it once per
 *   screen, next to the first use of the term, not on every repeat.
 *
 * Exports: WhatsThis.
 * Depends on: @radix-ui/react-popover, lucide-react, domain/plain-words, types/plain-words.types,
 *   theme/app.css (picker-in).
 */

import * as Popover from '@radix-ui/react-popover';
import { CircleHelp } from 'lucide-react';
import { TERM } from '#/domain/plain-words.js';
import type { TermId } from '#/types/plain-words.types.js';

export function WhatsThis(props: { term: TermId; className?: string }) {
  const { label, explain } = TERM[props.term];

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`What is ${label}?`}
          className={`inline-grid size-6 shrink-0 place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-hover hover:text-fg ${props.className ?? ''}`}
        >
          <CircleHelp aria-hidden="true" className="size-4" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          role="dialog"
          aria-label={label}
          sideOffset={6}
          collisionPadding={8}
          className="z-[80] grid w-72 max-w-[calc(100vw-1rem)] origin-(--radix-popover-content-transform-origin) gap-1 rounded-xl border border-line bg-surface p-3 text-sm shadow-float animate-[picker-in_120ms_ease-out]"
        >
          <p className="font-medium">{label}</p>
          <p className="min-w-0 break-words text-muted">{explain}</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
