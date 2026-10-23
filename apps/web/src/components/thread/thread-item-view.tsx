/**
 * ThreadItemView: draws one line of the Worker thread.
 *
 * Why: each kind of thing a Worker does needs its own weight on the page. Worker messages are
 *   quiet left-aligned bubbles that draw a safe markdown subset (never HTML); a message sent
 *   to the Worker is a right-aligned bubble labelled with who wrote it ("Director → Worker",
 *   "You → Worker") and whether the harness has taken it yet ("Delivered" / "Waiting to be
 *   delivered"), so the owner sees what was said. The sender and time show once per group of
 *   consecutive messages (domain/chat-groups); a lone item with no grouping always shows them.
 *   Tool calls are one collapsed row each (components/thread/thread-tool-line); permission
 *   denials are red and always visible; a call waiting for the owner's approval names itself
 *   and links to its item in the needs-you dock; questions are amber and say whether they are still
 *   waiting; finish and error end the run in plain words. Every other text is plain text,
 *   because it is untrusted model output. Every row can shrink below its content width (min-w-0,
 *   wrapping text) so a long path or summary never pushes the thread wider than its column.
 *
 * Exports: ThreadItemView.
 * Depends on: react, lucide-react, components/chat/*, components/thread/markdown-text,
 *   components/thread/thread-tool-line, domain/needs-you-dock, types/chat.types, types/thread.types.
 */

import {
  CircleAlert,
  CircleCheck,
  CircleX,
  ShieldCheck,
  ShieldQuestionMark,
  ShieldX,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { ChatBubble } from '#/components/chat/chat-bubble.js';
import { ChatRow } from '#/components/chat/chat-row.js';
import { MarkdownText } from '#/components/thread/markdown-text.js';
import { BriefLine, Time, ToolLine } from '#/components/thread/thread-tool-line.js';
import { DOCK_OPEN_EVENT } from '#/domain/needs-you-dock.js';
import type { ChatRowMeta } from '#/types/chat.types.js';
import type { ThreadItem } from '#/types/thread.types.js';

/** Who sent a steering message, and to whom: always the Worker. */
function senderLabel(author: string): string {
  if (author === 'owner') {
    return 'You → Worker';
  }

  if (author === 'director') {
    return 'Director → Worker';
  }

  return `${author} → Worker`;
}

/** Shown on its own (no grouping given): every speech item carries its header. */
const ALONE: ChatRowMeta = { header: true, day: null };

export function ThreadItemView(props: {
  item: ThreadItem;
  expandTools: boolean;
  /** Interaction ids still waiting for an answer. */
  pending: ReadonlySet<string>;
  /** Where grouping puts this item; omitted when drawn alone. */
  meta?: ChatRowMeta;
  first?: boolean;
}) {
  const { item } = props;
  const meta = props.meta ?? ALONE;
  const first = props.first ?? true;
  const row = (children: ReactNode, quiet = false) => (
    <ChatRow
      meta={quiet ? { header: false, day: meta.day } : meta}
      first={first}
      at={item.ts}
      align="start"
    >
      {children}
    </ChatRow>
  );

  switch (item.kind) {
    case 'brief':
      return row(<BriefLine item={item} />, true);
    case 'message':
      return (
        <ChatRow meta={meta} first={first} at={item.ts} align="start" author="Worker">
          <ChatBubble mine={false}>
            <MarkdownText text={item.text} />
          </ChatBubble>
        </ChatRow>
      );
    case 'user':
      return (
        <ChatRow
          meta={meta}
          first={first}
          at={item.ts}
          align="end"
          author={senderLabel(item.author)}
        >
          <ChatBubble mine>
            <p className="whitespace-pre-wrap">{item.text}</p>
          </ChatBubble>
          <p className="text-xs text-muted">
            {item.delivered ? 'Delivered' : 'Waiting to be delivered'}
          </p>
        </ChatRow>
      );
    case 'tool':
      return row(
        <div className="w-full max-w-xl min-w-0">
          <ToolLine item={item} expandAll={props.expandTools} />
        </div>,
        true,
      );
    case 'decision': {
      if (item.interactionId !== undefined && item.decision === 'ask') {
        const { interactionId } = item;
        const waiting = props.pending.has(interactionId);

        return row(
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium">
            <ShieldQuestionMark
              aria-hidden="true"
              className="size-4 shrink-0 text-attn"
            />
            <span>
              {waiting ? 'Waiting for your approval:' : 'Asked for your approval:'}
            </span>
            <code className="min-w-0 break-all font-data font-normal">{item.what}</code>
            {waiting ? (
              <a
                href={`#escalation-${interactionId}`}
                onClick={(event) => {
                  event.preventDefault();
                  window.dispatchEvent(
                    new CustomEvent(DOCK_OPEN_EVENT, { detail: { interactionId } }),
                  );
                }}
                className="font-medium text-signal underline-offset-2 hover:underline"
              >
                Open it
              </a>
            ) : null}
            <Time ts={item.ts} />
          </p>,
          true,
        );
      }

      const denied = item.decision === 'deny';
      const asked = item.decision === 'ask';
      const Icon = denied ? ShieldX : ShieldCheck;

      return row(
        <p
          className={`flex items-center gap-2 text-xs ${denied ? 'font-medium text-danger' : asked ? 'font-medium' : 'text-muted'}`}
        >
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          {denied ? 'Denied' : asked ? 'Asked about' : 'Allowed'}{' '}
          <span className="font-data">{item.tool}</span>
          <Time ts={item.ts} />
        </p>,
        true,
      );
    }

    case 'ask': {
      const waiting = props.pending.has(item.interactionId);

      return row(
        <div className="grid w-full max-w-xl min-w-0 grid-cols-[minmax(0,1fr)] gap-1 rounded-xl border border-attn bg-attn-soft p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CircleAlert aria-hidden="true" className="size-4 text-attn" />
            The Worker asked
            <span className="ml-auto text-xs font-normal text-muted">
              {waiting ? 'Waiting for your answer' : 'Answered'}
            </span>
          </p>
          <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
            {item.prompt}
          </p>
        </div>,
        true,
      );
    }

    case 'status': {
      const tone =
        item.tone === 'danger'
          ? 'border-danger bg-danger-soft'
          : item.tone === 'good'
            ? 'border-good'
            : 'border-line';

      const Icon = item.tone === 'danger' ? CircleX : CircleCheck;

      return row(
        <div
          role={item.tone === 'danger' ? 'alert' : undefined}
          className={`grid w-full max-w-xl min-w-0 grid-cols-[minmax(0,1fr)] gap-1 rounded-xl border p-3 ${tone}`}
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <Icon aria-hidden="true" className="size-4" />
            {item.label}
            <span className="ml-auto">
              <Time ts={item.ts} />
            </span>
          </p>
          {item.detail ? (
            <p className="whitespace-pre-wrap text-sm text-muted [overflow-wrap:anywhere]">
              {item.detail}
            </p>
          ) : null}
        </div>,
        true,
      );
    }
  }
}
