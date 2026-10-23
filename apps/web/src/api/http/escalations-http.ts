/**
 * The `http` side of the escalations resource.
 *
 * Why: this is the only place that knows the escalation paths. Every answer is parsed with the
 *   schemas in `schemas/escalation`, and every body is parsed with `EscalationActBody` before it
 *   is sent, so a malformed action (a re-plan with no comment) fails in the browser with the
 *   field named instead of as a server refusal the owner cannot act on.
 *
 * Exports: createEscalationsHttp().
 * Depends on: api/http/request-json, schemas/escalation, types/api.types, types/escalations-api.types.
 */

import { requestJson } from '#/api/http/request-json.js';
import {
  ActionConsequences,
  EscalationActBody,
  EscalationActReply,
  EscalationList,
  TicketActReply,
} from '#/schemas/escalation.js';
import type { HttpClientOptions } from '#/types/api.types.js';
import type { EscalationsApi } from '#/types/escalations-api.types.js';

const enc = encodeURIComponent;

export function createEscalationsHttp(client: HttpClientOptions): EscalationsApi {
  return {
    forCard: (cardId, options) =>
      requestJson(client, `/cards/${enc(cardId)}/escalations`, EscalationList, options),
    act: (interactionId, body) =>
      requestJson(client, `/interactions/${enc(interactionId)}/act`, EscalationActReply, {
        method: 'POST',
        body: EscalationActBody.parse(body),
      }),
    actOnTicket: (ticketId, body) =>
      requestJson(client, `/tickets/${enc(ticketId)}/act`, TicketActReply, {
        method: 'POST',
        body: EscalationActBody.parse(body),
      }),
    consequences: (ticketId, action, options) =>
      requestJson(
        client,
        `/tickets/${enc(ticketId)}/consequences?action=${action}`,
        ActionConsequences,
        options,
      ),
  };
}
