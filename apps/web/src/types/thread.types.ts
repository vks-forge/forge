/**
 * Shapes of the live Worker thread.
 *
 * Why: the server streams raw run events (a tool call, then later its result; a permission
 *   decision; a question). A person reads a conversation, not a log, so events are folded
 *   into a few kinds of thread item. Keeping the item shapes here lets the folding logic and
 *   the renderers be written and tested apart.
 *
 * Exports: ThreadItem and its members, ThreadState, ThreadConnection.
 * Depends on: @forge/core (types), types/sse.types. Types only.
 */

import type { ErrorFamily, InteractionKind, PermissionDecision } from '@forge/core';

interface ItemBase {
  /** The event `seq` that created the item; unique within a run, so it is the React key. */
  readonly seq: number;
  readonly ts: string;
}

export interface MessageItem extends ItemBase {
  readonly kind: 'message';
  readonly text: string;
}

/** The instructions the Worker was sent at run start. */
export interface BriefItem extends ItemBase {
  readonly kind: 'brief';
  readonly text: string;
}

export interface ToolItem extends ItemBase {
  readonly kind: 'tool';
  readonly callId: string;
  readonly name: string;
  readonly input: unknown;
  /** True once the matching `tool_result` arrived. */
  readonly done: boolean;
  readonly output?: unknown;
  readonly isError?: boolean;
}

export interface AskItem extends ItemBase {
  readonly kind: 'ask';
  readonly interactionId: string;
  readonly interactionKind: InteractionKind;
  readonly prompt: string;
}

export interface DecisionItem extends ItemBase {
  readonly kind: 'decision';
  readonly tool: string;
  readonly decision: PermissionDecision;
  /** Set when the call waits on the owner: the approval item to open. */
  readonly interactionId?: string;
  /** The command, path or address of the call, for the "Waiting for your approval" line. */
  readonly what?: string;
}

export interface StatusItem extends ItemBase {
  readonly kind: 'status';
  readonly tone: 'info' | 'good' | 'danger';
  readonly label: string;
  readonly detail?: string;
  readonly family?: ErrorFamily;
}

/** What a person typed to the Worker mid-run (a steering message, d-0109). */
export interface UserItem extends ItemBase {
  readonly kind: 'user';
  readonly author: string;
  readonly text: string;
  /** The inbox row number; the later `inbox_delivered` event names the same one. */
  readonly inboxSeq: number;
  /** True once the driver reported the harness took the message. */
  readonly delivered: boolean;
}

export type ThreadItem =
  BriefItem | MessageItem | ToolItem | AskItem | DecisionItem | StatusItem | UserItem;

export interface ThreadState {
  readonly items: readonly ThreadItem[];
  /** Highest `seq` applied; anything at or below it is a replay and is ignored. */
  readonly lastSeq: number;
}

/** What the page shows about the stream: not started, live, reconnecting, over, or failed. */
export type ThreadConnection =
  'connecting' | 'live' | 'reconnecting' | 'ended' | 'failed';
