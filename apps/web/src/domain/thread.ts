/**
 * Thread folding: turns a run's raw events into the items of the Worker thread.
 *
 * Why: a Worker run arrives as a stream of small events: text, a tool call and (later) its
 *   result, a permission decision, a question for the user, a finish or an error. Rendering
 *   them one per line makes a log nobody reads: a reply streams in as dozens of one-word
 *   text chunks, which this reducer joins into one message, and a tool call whose input
 *   arrives in a later update gets that input filled in. The brief the Worker was sent
 *   (a `prompt` event) becomes its own item at the top. A steering message (`user_message`) and
 *   its later `inbox_delivered` share an `inbox_seq`: the delivery marks the message's bubble
 *   delivered instead of adding a bare line the owner cannot read, and only a delivery whose
 *   message is not in the thread (history cut) becomes a status line. This reducer pairs a tool call with its
 *   result, keeps questions, denials and calls waiting for the owner's approval visible, turns finish and error into status lines,
 *   and drops machine noise (usage, session, liveness). It is idempotent per `seq`: after a
 *   reconnect the server replays from the last `seq` we saw, and a duplicate must never show
 *   twice. Pure and synchronous so every event type is testable without a browser.
 *
 * Exports: EMPTY_THREAD, applyEvent(), applyEvents(), pendingAsk().
 * Depends on: @forge/core (RunEvent type), types/thread.types. No IO.
 */

import type { RunEvent } from '@forge/core';
import type { StatusItem, ThreadItem, ThreadState } from '#/types/thread.types.js';

/**
 * What a call was about, for a line that names it: the command, path or address of the tool
 * call with this id when the thread has seen it, else the tool's name.
 */
function callText(items: readonly ThreadItem[], callId: string, tool: string): string {
  const call = items.find((item) => item.kind === 'tool' && item.callId === callId);
  const input =
    call?.kind === 'tool' && call.input !== null && typeof call.input === 'object'
      ? (call.input as Record<string, unknown>)
      : {};

  for (const key of ['command', 'file_path', 'path', 'url']) {
    const value = input[key];
    if (typeof value === 'string' && value !== '') {
      return value;
    }
  }

  return tool;
}

export const EMPTY_THREAD: ThreadState = { items: [], lastSeq: -1 };

function toolResult(
  items: readonly ThreadItem[],
  event: Extract<RunEvent, { type: 'tool_result' }>,
): readonly ThreadItem[] {
  const index = items.findIndex(
    (item) => item.kind === 'tool' && item.callId === event.call_id,
  );

  const call = items[index];
  if (call?.kind !== 'tool') {
    // A result whose call we never saw (joined mid-run): show it as its own tool line.
    return [
      ...items,
      {
        kind: 'tool',
        seq: event.seq,
        ts: event.ts,
        callId: event.call_id,
        name: 'tool',
        input: undefined,
        done: true,
        output: event.output,
        isError: event.is_error,
      },
    ];
  }

  return items.map((item, i) =>
    i === index
      ? { ...call, done: true, output: event.output, isError: event.is_error }
      : item,
  );
}

function statusOf(event: RunEvent): StatusItem | null {
  const base = { kind: 'status' as const, seq: event.seq, ts: event.ts };
  switch (event.type) {
    case 'finish':
      return { ...base, tone: 'good', label: 'Finished', detail: event.summary };
    case 'error':
      return {
        ...base,
        tone: 'danger',
        label: 'Run failed',
        detail: event.message,
        family: event.family,
      };
    case 'inbox_delivered':
      // Only reached when no matching `user_message` is in the thread (history cut).
      return {
        ...base,
        tone: 'info',
        label: `Steering message #${event.inbox_seq} delivered`,
      };
    default:
      return null;
  }
}

/** Folds one event into the thread; a replayed or older `seq` changes nothing. */
export function applyEvent(state: ThreadState, event: RunEvent): ThreadState {
  if (event.seq <= state.lastSeq) {
    return state;
  }

  const next = (items: readonly ThreadItem[]): ThreadState => ({
    items,
    lastSeq: event.seq,
  });

  switch (event.type) {
    case 'text': {
      const last = state.items.at(-1);
      // Streamed chunks are one message; the raw chunks stay in storage (d-0163 trace, receipts).
      if (last?.kind === 'message') {
        return next([
          ...state.items.slice(0, -1),
          { ...last, text: last.text + event.text },
        ]);
      }

      return next([
        ...state.items,
        { kind: 'message', seq: event.seq, ts: event.ts, text: event.text },
      ]);
    }

    case 'prompt':
      return next([
        ...state.items,
        { kind: 'brief', seq: event.seq, ts: event.ts, text: event.text },
      ]);
    case 'tool_call_update':
      return next(
        state.items.map((item) =>
          item.kind === 'tool' && item.callId === event.call_id
            ? { ...item, input: event.input }
            : item,
        ),
      );
    case 'user_message':
      return next([
        ...state.items,
        {
          kind: 'user',
          seq: event.seq,
          ts: event.ts,
          author: event.author,
          text: event.text,
          inboxSeq: event.inbox_seq,
          delivered: false,
        },
      ]);
    case 'inbox_delivered': {
      const paired = state.items.some(
        (item) => item.kind === 'user' && item.inboxSeq === event.inbox_seq,
      );

      // The bubble carries the delivery state; a bare status line only when its message is gone.
      if (!paired) {
        return next([...state.items, statusOf(event) as StatusItem]);
      }

      return next(
        state.items.map((item) =>
          item.kind === 'user' && item.inboxSeq === event.inbox_seq
            ? { ...item, delivered: true }
            : item,
        ),
      );
    }

    case 'tool_call':
      return next([
        ...state.items,
        {
          kind: 'tool',
          seq: event.seq,
          ts: event.ts,
          callId: event.call_id,
          name: event.name,
          input: event.input,
          done: false,
        },
      ]);
    case 'tool_result':
      return next(toolResult(state.items, event));
    case 'ask':
      return next([
        ...state.items,
        {
          kind: 'ask',
          seq: event.seq,
          ts: event.ts,
          interactionId: event.interaction_id,
          interactionKind: event.kind,
          prompt: event.prompt,
        },
      ]);
    case 'permission':
      return next([
        ...state.items,
        {
          kind: 'decision',
          seq: event.seq,
          ts: event.ts,
          tool: event.tool,
          decision: event.decision,
          ...(event.interaction_id === undefined
            ? {}
            : {
                interactionId: event.interaction_id,
                what: callText(state.items, event.call_id, event.tool),
              }),
        },
      ]);
    default: {
      const status = statusOf(event);

      // usage, session and hook_liveness still advance `lastSeq` so a replay skips them.
      return next(status ? [...state.items, status] : state.items);
    }
  }
}

export function applyEvents(
  state: ThreadState,
  events: readonly RunEvent[],
): ThreadState {
  return events.reduce(applyEvent, state);
}

/** The question text for an interaction, from the stream, when the run asked it. */
export function pendingAsk(
  items: readonly ThreadItem[],
  interactionId: string,
): string | undefined {
  for (const item of items) {
    if (item.kind === 'ask' && item.interactionId === interactionId) {
      return item.prompt;
    }
  }

  return undefined;
}
