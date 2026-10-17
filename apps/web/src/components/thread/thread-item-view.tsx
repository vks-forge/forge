/**
 * ThreadItemView: draws one line of the Worker thread.
 *
 * Why: each kind of thing a Worker does needs its own weight on the page. Plain messages
 *   read as prose; tool calls are one collapsed line (name, a short hint of the input, a
 *   running/ok/failed mark) that expands to the full input and output, because most calls
 *   are noise until something goes wrong; permission denials are red and always visible;
 *   questions are amber and say whether they are still waiting; finish and error end the
 *   run in plain words; a message sent to the Worker is a right-aligned bubble labelled
 *   with who wrote it ("Director → Worker", "You → Worker") and whether the harness has taken it
 *   yet ("Delivered" / "Waiting to be delivered"), so the owner sees what was said. Worker messages draw a safe markdown subset (never HTML); every
 *   other text is plain text, because it is untrusted model output. Every row can shrink
 *   below its content width (min-w-0, single minmax(0,1fr) track, wrapping text) so a long
 *   path or summary never pushes the thread under the Runs column.
 *
 * Exports: ThreadItemView.
 * Depends on: react, lucide-react, components/thread/markdown-text, domain/relative-time,
 *   types/thread.types.
 */

import {
  CircleAlert,
  CircleCheck,
  CircleX,
  ChevronRight,
  FileText,
  LoaderCircle,
  ShieldCheck,
  ShieldX,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { MarkdownText } from '#/components/thread/markdown-text.js';
import { clockTime } from '#/domain/relative-time.js';
import type { BriefItem, ThreadItem, ToolItem } from '#/types/thread.types.js';

const MAX_SHOWN = 4000;

/** Pretty JSON or the string itself, cut so one huge output cannot freeze the page. */
function show(value: unknown): string {
  if (value === undefined) {
    return '';
  }

  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const shown = text ?? String(value);

  return shown.length > MAX_SHOWN
    ? `${shown.slice(0, MAX_SHOWN)}\n… ${shown.length - MAX_SHOWN} more characters not shown`
    : shown;
}

/** A one-line hint of what the call did: the command, path or first string field. */
function hint(input: unknown): string {
  if (typeof input === 'string') {
    return input;
  }

  if (input !== null && typeof input === 'object') {
    for (const value of Object.values(input)) {
      if (typeof value === 'string') {
        return value;
      }
    }
  }

  return '';
}

function Time(props: { ts: string }) {
  return (
    <time dateTime={props.ts} className="font-data text-xs text-muted">
      {clockTime(props.ts)}
    </time>
  );
}

function ToolLine(props: { item: ToolItem; expandAll: boolean }) {
  const { item, expandAll } = props;
  const [open, setOpen] = useState(false);
  const expanded = open || expandAll;
  const failed = item.done && item.isError === true;
  const Mark = !item.done ? LoaderCircle : failed ? CircleX : CircleCheck;

  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setOpen(!expanded)}
        className="flex min-h-9 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-hover"
      >
        <ChevronRight
          aria-hidden="true"
          className={`size-4 shrink-0 text-muted transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
        />
        <Wrench aria-hidden="true" className="size-4 shrink-0 text-muted" />
        <span className="shrink-0 font-medium">{item.name}</span>
        <span className="min-w-0 flex-1 truncate font-data text-xs text-muted">
          {hint(item.input)}
        </span>
        <Mark
          aria-hidden="true"
          className={`size-4 shrink-0 ${!item.done ? 'animate-spin text-signal' : failed ? 'text-danger' : 'text-good'}`}
        />
        <span className="sr-only">
          {!item.done ? 'running' : failed ? 'failed' : 'finished'}
        </span>
      </button>
      {expanded ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 border-t border-line p-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">Input</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-data text-xs">
              {show(item.input) || '(none)'}
            </pre>
          </div>
          {item.done ? (
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted">
                {failed ? 'Error output' : 'Output'}
              </p>
              <pre
                className={`max-h-64 overflow-auto whitespace-pre-wrap break-words font-data text-xs ${failed ? 'text-danger' : ''}`}
              >
                {show(item.output) || '(empty)'}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BriefLine(props: { item: BriefItem }) {
  const { item } = props;

  return (
    <details className="min-w-0 rounded-lg border border-line bg-surface">
      <summary className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-hover">
        <FileText aria-hidden="true" className="size-4 shrink-0 text-muted" />
        <span className="font-medium">Brief sent to the Worker</span>
        <span className="ml-auto">
          <Time ts={item.ts} />
        </span>
      </summary>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-line p-2 font-data text-xs">
        {show(item.text)}
      </pre>
    </details>
  );
}

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

export function ThreadItemView(props: {
  item: ThreadItem;
  expandTools: boolean;
  /** Interaction ids still waiting for an answer. */
  pending: ReadonlySet<string>;
}) {
  const { item } = props;

  switch (item.kind) {
    case 'brief':
      return <BriefLine item={item} />;
    case 'message':
      return (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5">
          <Time ts={item.ts} />
          <MarkdownText text={item.text} />
        </div>
      );
    case 'user':
      return (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] justify-items-end gap-0.5">
          <p className="flex items-center gap-2 text-xs text-muted">
            <span className="font-medium text-fg">{senderLabel(item.author)}</span>
            <Time ts={item.ts} />
          </p>
          <p className="max-w-[88%] whitespace-pre-wrap [overflow-wrap:anywhere] rounded-2xl bg-signal-soft px-3 py-2 text-sm">
            {item.text}
          </p>
          <p className="text-xs text-muted">
            {item.delivered ? 'Delivered' : 'Waiting to be delivered'}
          </p>
        </div>
      );
    case 'tool':
      return <ToolLine item={item} expandAll={props.expandTools} />;
    case 'decision': {
      const denied = item.decision === 'deny';
      const asked = item.decision === 'ask';
      const Icon = denied ? ShieldX : ShieldCheck;

      return (
        <p
          className={`flex items-center gap-2 text-xs ${denied ? 'font-medium text-danger' : asked ? 'font-medium' : 'text-muted'}`}
        >
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          {denied ? 'Denied' : asked ? 'Asked about' : 'Allowed'}{' '}
          <span className="font-data">{item.tool}</span>
          <Time ts={item.ts} />
        </p>
      );
    }

    case 'ask': {
      const waiting = props.pending.has(item.interactionId);

      return (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 rounded-xl border border-attn bg-attn-soft p-3">
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
        </div>
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

      return (
        <div
          role={item.tone === 'danger' ? 'alert' : undefined}
          className={`grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 rounded-xl border p-3 ${tone}`}
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
        </div>
      );
    }
  }
}
