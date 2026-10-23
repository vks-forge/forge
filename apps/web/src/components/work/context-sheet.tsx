/**
 * ContextSheet: Plan, Evidence, Tickets and Details as a full-screen sheet over the chat.
 *
 * Why: below 1024 px there is no room beside the conversation, but the owner still has to read
 *   the plan before approving it. The sheet is the rail's content over the whole screen: it
 *   opens from the header, traps focus, closes with Esc or "Back to chat" and returns focus to
 *   the button that opened it, so the chat underneath is never lost. Its open state is the
 *   address (the tab segment), so Back closes it and a shared link opens it.
 *
 * Exports: ContextSheet.
 * Depends on: @radix-ui/react-dialog, lucide-react, react.
 */

import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

export function ContextSheet(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The tab strip, drawn under the title. */
  tabs: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog.Root
      open={props.open}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-40 flex min-w-0 flex-col bg-bg"
        >
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-2">
            <Dialog.Close className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted hover:bg-hover hover:text-fg">
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back to chat
            </Dialog.Close>
            <Dialog.Title className="min-w-0 flex-1 truncate text-sm font-semibold">
              {props.title}
            </Dialog.Title>
          </header>
          <div className="shrink-0 px-2">{props.tabs}</div>
          <div className="flex min-h-0 flex-1 flex-col px-3 pb-[env(safe-area-inset-bottom)]">
            {props.children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
