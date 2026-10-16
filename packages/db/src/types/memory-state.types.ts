/**
 * Shape of the in-memory adapter's state.
 *
 * Why: the in-memory adapter has to roll a transaction back the way sqlite does. Holding
 *   all of its tables, and the counters that stand in for SQLite's autoincrement ids, in
 *   one state object lets it snapshot before the callback and restore on a throw, so
 *   engine failure-path tests see the same atomicity (and the same unconsumed ids) the
 *   SQLite adapter gives.
 *
 * Exports: MemoryState.
 * Depends on: @forge/core (types). Types only.
 */

import type {
  Card,
  CardEvent,
  CardRelation,
  CardReplyQueueItem,
  CardType,
  GateResult,
  Harness,
  HarnessState,
  GithubConnection,
  HarnessToolSchema,
  InboxStateRow,
  HarnessVersion,
  Interaction,
  Project,
  Run,
  RunEvent,
  RunInboxMessage,
  StoredIntakeEvent,
  Ticket,
  TicketRelation,
  WakeRequest,
} from '@forge/core';

/** All rows held by `createMemoryStorage`, keyed by primary key. */
export interface MemoryState {
  /** Tickets as stored: no `parent`, empty `blocked_by` (both are derived from `relations`). */
  tickets: Map<string, Ticket>;
  /** `ticket_relations` in insertion order: the one source of parent and blocker links. */
  relations: TicketRelation[];
  runs: Map<string, Run>;
  events: Map<string, Map<number, RunEvent>>;
  /** Run inbox messages per run, in seq order. */
  inbox: Map<string, RunInboxMessage[]>;
  /** Stored intake events keyed by JSON of `[source, dedupe_key]`. */
  intake: Map<string, StoredIntakeEvent>;
  /** Last intake id handed out (SQLite AUTOINCREMENT stand-in). */
  intakeSeq: number;
  interactions: Map<string, Interaction>;
  /** Run id to token digest; `revoked` tokens are kept so a re-issue can be told apart. */
  tokens: Map<string, { sha256: string; revoked: boolean }>;
  wakes: Map<string, WakeRequest>;
  gates: GateResult[];
  /** Last gate result id handed out. */
  gateSeq: number;
  projects: Map<string, Project>;
  harnesses: Map<string, Harness>;
  /** Parked harnesses keyed by harness id. */
  harnessState: Map<string, HarnessState>;
  githubConnections: Map<string, GithubConnection>;
  /** Keyed by `kind/version`. */
  harnessVersions: Map<string, HarnessVersion>;
  /** Keyed by `kind/version/tool`; insertion order is list order. */
  harnessToolSchemas: Map<string, HarnessToolSchema>;
  /** Keyed by JSON of `[project, kind, item_id]`. */
  inboxStates: Map<string, InboxStateRow>;
  /** Cards keyed by id. */
  cards: Map<string, Card>;
  /** Card history per card, in seq order (the index is the seq). */
  cardEvents: Map<string, CardEvent[]>;
  /** Card type registry keyed by name; insertion order is list order. */
  cardTypes: Map<string, CardType>;
  /** `card_relations` in insertion order: the one source of card dependencies. */
  cardRelations: CardRelation[];
  /** `card_reply_queue` rows in id order. */
  cardReplies: CardReplyQueueItem[];
  /** Last reply id handed out (SQLite AUTOINCREMENT stand-in). */
  cardReplySeq: number;
}
