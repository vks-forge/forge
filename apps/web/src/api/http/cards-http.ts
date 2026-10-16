/**
 * The `http` side of the cards resource.
 *
 * Why: this is the only place that knows the card paths and how a slug, a card id, a cursor
 *   or the optional `column` and `type` filters are written into a URL. Every answer is parsed
 *   with the schemas in `schemas/cards`, so a server and UI that disagree fail here with the
 *   offending field named, while history events stay open to kinds this UI does not know yet.
 *
 * Exports: createCardsHttp().
 * Depends on: api/http/request-json, schemas/cards, schemas/plan, types/api.types, types/cards-api.types, zod.
 */

import { z } from 'zod';
import { requestJson } from '#/api/http/request-json.js';
import {
  CardCreateReply,
  CardDetailReply,
  CardHistoryPage,
  CardListReply,
  CardMessageReply,
  CardTypesReply,
} from '#/schemas/cards.js';
import { PlanApproveReply, PlanReply, PlanVersionReply } from '#/schemas/plan.js';
import type { HttpClientOptions } from '#/types/api.types.js';
import type { CardsApi } from '#/types/cards-api.types.js';

const enc = encodeURIComponent;

/** Replies the UI does not read (it reloads the card instead): any body, or none. */
const Ignored = z.unknown();

/** `?a=1&b=2`, skipping undefined values. */
function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }

  const text = search.toString();

  return text === '' ? '' : `?${text}`;
}

export function createCardsHttp(client: HttpClientOptions): CardsApi {
  return {
    list: (params, options) =>
      requestJson(
        client,
        `/projects/${enc(params.slug)}/cards${query({
          column: params.column,
          type: params.type,
          cursor: params.cursor,
          limit: params.limit,
        })}`,
        CardListReply,
        options,
      ),
    get: (id, options) =>
      requestJson(client, `/cards/${enc(id)}`, CardDetailReply, options),
    events: (id, params, options) =>
      requestJson(
        client,
        `/cards/${enc(id)}/events${query({
          after: params.after,
          before: params.before,
          order: params.order,
          limit: params.limit,
        })}`,
        CardHistoryPage,
        options,
      ),
    types: async (options) =>
      (await requestJson(client, '/card-types', CardTypesReply, options)).types,
    patch: (id, body) =>
      requestJson(client, `/cards/${enc(id)}`, CardDetailReply, {
        method: 'PATCH',
        body,
      }),
    create: (slug, body, options) =>
      requestJson(client, `/projects/${enc(slug)}/cards`, CardCreateReply, {
        ...options,
        method: 'POST',
        body,
      }),
    setRelations: (id, body) =>
      requestJson(client, `/cards/${enc(id)}/relations`, CardCreateReply, {
        method: 'PUT',
        body,
      }),
    send: (id, text, author) =>
      requestJson(client, `/cards/${enc(id)}/messages`, CardMessageReply, {
        method: 'POST',
        body: { text, author },
      }),
    plan: (id, options) =>
      requestJson(client, `/cards/${enc(id)}/plan`, PlanReply, options),
    planVersion: (id, version, options) =>
      requestJson(client, `/cards/${enc(id)}/plan/${version}`, PlanVersionReply, options),
    answerGrill: (id, body) =>
      requestJson(client, `/cards/${enc(id)}/grill/answer`, Ignored, {
        method: 'POST',
        body,
      }),
    grillShortcut: (id, kind) =>
      requestJson(client, `/cards/${enc(id)}/grill/shortcut`, Ignored, {
        method: 'POST',
        body: { kind },
      }),
    approvePlan: (id, version) =>
      requestJson(client, `/cards/${enc(id)}/plan/approve`, PlanApproveReply, {
        method: 'POST',
        body: { version },
      }),
    requestChanges: (id, version, comment) =>
      requestJson(client, `/cards/${enc(id)}/plan/request-changes`, Ignored, {
        method: 'POST',
        body: { version, comment },
      }),
    editPlanTickets: (id, version, body) =>
      requestJson(client, `/cards/${enc(id)}/plan/${version}/tickets`, PlanVersionReply, {
        method: 'PATCH',
        body,
      }),
    startPlanning: (id) =>
      requestJson(client, `/cards/${enc(id)}/start-planning`, Ignored, {
        method: 'POST',
      }),
    runAsExpress: (ticketId) =>
      requestJson(client, `/tickets/${enc(ticketId)}/run-as-express`, Ignored, {
        method: 'POST',
      }),
  };
}
