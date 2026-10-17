/**
 * ToolLine and BriefLine: the compact rows of a Worker thread that are not speech.
 *
 * Why: most tool calls are noise until something goes wrong, so each is one collapsed line
 *   (name, a short hint of the input, a running/ok/failed mark) that expands to the full
 *   input and output; the brief the Worker was sent at start is a collapsed row too. Output is
 *   cut at a few thousand characters so one huge result cannot freeze the page, and every row
 *   can shrink below its content width so a long path never widens the thread.
 *
 * Exports: ToolLine, BriefLine, Time.
 * Depends on: react, lucide-react, domain/relative-time, types/thread.types.
 */

import {
  ChevronRight,
  CircleCheck,
  CircleX,
  FileText,
  LoaderCircle,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { clockTime } from '#/domain/relative-time.js';
import type { BriefItem, ToolItem } from '#/types/thread.types.js';

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

export function Time(props: { ts: string }) {
  return (
    <time dateTime={props.ts} className="font-data text-xs text-muted">
      {clockTime(props.ts)}
    </time>
  );
}

export function ToolLine(props: { item: ToolItem; expandAll: boolean }) {
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
            <pre className="max-h-64 scroll-area overflow-auto whitespace-pre-wrap break-words font-data text-xs">
              {show(item.input) || '(none)'}
            </pre>
          </div>
          {item.done ? (
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted">
                {failed ? 'Error output' : 'Output'}
              </p>
              <pre
                className={`max-h-64 scroll-area overflow-auto whitespace-pre-wrap break-words font-data text-xs ${failed ? 'text-danger' : ''}`}
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

export function BriefLine(props: { item: BriefItem }) {
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
      <pre className="max-h-96 scroll-area overflow-auto whitespace-pre-wrap break-words border-t border-line p-2 font-data text-xs">
        {show(item.text)}
      </pre>
    </details>
  );
}
