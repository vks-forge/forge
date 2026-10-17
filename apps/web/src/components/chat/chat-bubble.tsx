/**
 * ChatBubble: the quiet speech bubble of the card chat and the Worker thread.
 *
 * Why: a bubble should carry words, not announce itself. It is a neutral surface with a
 *   hairline border and no saturated fill, narrow (70% of the column, never wider than 36rem)
 *   so long lines stay readable; the owner's sits on the right on a slightly deeper neutral so
 *   turn-taking reads without colour, the Director's and Worker's on the left. Long unbroken
 *   strings (a path, a hash) wrap instead of widening it. An unsent message is dimmed.
 *
 * Exports: ChatBubble.
 * Depends on: react.
 */

import type { ReactNode } from 'react';

export function ChatBubble(props: {
  mine: boolean;
  pending?: boolean | undefined;
  children: ReactNode;
}) {
  return (
    <div
      className={`min-w-0 max-w-[min(70%,36rem)] rounded-2xl border border-line px-3 py-2 text-sm [overflow-wrap:anywhere] max-[480px]:max-w-[88%] ${
        props.mine ? 'bg-hover' : 'bg-surface'
      } ${props.pending ? 'opacity-70' : ''}`}
    >
      {props.children}
    </div>
  );
}
