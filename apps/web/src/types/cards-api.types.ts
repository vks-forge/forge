/**
 * The cards resource of the ForgeApi port.
 *
 * Why: the Board's Cards view and the Card page read and change cards through the real
 *   server (d-0123). Naming the calls once lets the http adapter, the hooks and the tests agree
 *   on them, and keeps `type`, `closed_reason` and a chat message as the only things the UI
 *   can write, as the server allows (the column is never patched, d-0107). A card is created
 *   here, not through chat intake, and its dependencies are set through one relations call.
 *   The planning flow's calls live here too: the plan and its versions, answering the grill,
 *   its two shortcuts, approving or sending back a plan, light ticket edits, and starting
 *   planning on a backfilled card. Each is the only way the UI moves the card through a phase.
 *
 * Exports: CardsApi, CardListParams, CardEventsParams, CardHistory, CardRelationsBody,
 *   GrillAnswerBody, GrillShortcutKind.
 * Depends on: @forge/core (types), schemas/cards, schemas/new-card, schemas/plan, types/plan.types,
 *   types/api.types (types only).
 */

import type { CardType, CardTypeName } from '@forge/core';
import type {
  CardColumn,
  CardCreateReply,
  CardDetailReply,
  CardHistoryEvent,
  CardHistoryPage,
  CardListReply,
  CardMessageReply,
} from '#/schemas/cards.js';
import type { NewCardInput } from '#/schemas/new-card.js';
import type { PlanApproveReply, PlanReply, PlanVersionReply } from '#/schemas/plan.js';
import type { PlanEditBody } from '#/types/plan.types.js';
import type { RequestOptions } from '#/types/api.types.js';

export interface CardListParams {
  readonly slug: string;
  readonly column?: CardColumn;
  readonly type?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

/** Windows of the history by `seq` (exclusive bounds); see `GET /cards/:id/events`. */
export interface CardEventsParams {
  /** Events after this `seq`, oldest first: the poll. */
  readonly after?: number;
  /** Events before this `seq`, newest first: "load older". */
  readonly before?: number;
  /** `desc` with no bound is the newest page. */
  readonly order?: 'asc' | 'desc';
  readonly limit?: number;
}

/** The part of a card's history the page holds, oldest first, deduplicated by `seq`. */
export interface CardHistory {
  readonly events: readonly CardHistoryEvent[];
  /** True while events older than the oldest one held may exist. */
  readonly hasOlder: boolean;
}

/** `PUT /cards/:id/relations`: the whole set of both lists, replacing what the card had. */
export interface CardRelationsBody {
  readonly depends_on: readonly string[];
  readonly blocks: readonly string[];
}

export type GrillShortcutKind = 'use_recommendations' | 'write_plan_now';

/** Exactly one of `option_id` and `text`. */
export type GrillAnswerBody =
  | { readonly question_id: string; readonly option_id: string }
  | { readonly question_id: string; readonly text: string };

export interface CardsApi {
  list(params: CardListParams, options?: RequestOptions): Promise<CardListReply>;
  get(id: string, options?: RequestOptions): Promise<CardDetailReply>;
  /** One window of history; the order follows the params, items always carry `seq`. */
  events(
    id: string,
    params: CardEventsParams,
    options?: RequestOptions,
  ): Promise<CardHistoryPage>;
  types(options?: RequestOptions): Promise<readonly CardType[]>;
  /** Changes the type, or closes the card with a reason; returns the card as it now is. */
  patch(
    id: string,
    body: { type?: CardTypeName; closed_reason?: string },
  ): Promise<CardDetailReply>;
  /** Creates a card; the Director starts on it at once. A repeated `dedupe_key` returns the first card. */
  create(
    slug: string,
    body: NewCardInput,
    options?: RequestOptions,
  ): Promise<CardCreateReply>;
  /** Replaces the card's dependency lists; a loop is refused with 409 `dependency_cycle`. */
  setRelations(id: string, body: CardRelationsBody): Promise<CardCreateReply>;
  /** Sends a chat message to the card's Director; its reply arrives later as an event. */
  send(id: string, text: string, author: string): Promise<CardMessageReply>;
  /** The plan's version list, the current version and the floor result. */
  plan(id: string, options?: RequestOptions): Promise<PlanReply>;
  /** One stored version; 404 when it does not exist. */
  planVersion(
    id: string,
    version: number,
    options?: RequestOptions,
  ): Promise<PlanVersionReply>;
  /** Answers the open grill question; 409 `question_not_open` when it is not (or no longer) open. */
  answerGrill(id: string, body: GrillAnswerBody): Promise<unknown>;
  grillShortcut(id: string, kind: GrillShortcutKind): Promise<unknown>;
  /** Creates the tickets; 409 `stale_plan` or `phase_mismatch` when the plan moved on. */
  approvePlan(id: string, version: number): Promise<PlanApproveReply>;
  requestChanges(id: string, version: number, comment: string): Promise<unknown>;
  /** Light ticket edits; writes a new version. 409 `ticket_has_dependents` and friends. */
  editPlanTickets(
    id: string,
    version: number,
    body: PlanEditBody,
  ): Promise<PlanVersionReply>;
  /** Starts planning on a backfilled card. */
  startPlanning(id: string): Promise<unknown>;
  /** Re-runs the planning step that stopped on a too-small step budget. */
  retryPlanningStep(id: string): Promise<unknown>;
  /** Releases a held, non-Express planned ticket into Express. */
  runAsExpress(ticketId: string): Promise<unknown>;
}
