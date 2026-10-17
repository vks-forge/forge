/**
 * The planning routes: plan reads, grill answers and shortcuts, approval, change requests,
 * ticket edits, start-planning, retry of a stopped planning step and run-as-express.
 *
 * Why: the Director shapes every Plan card into an approved plan with the owner (d-0130 to
 *   d-0133), and the card page drives each owner action through these routes. Each is a thin
 *   door: parse the body, call the matching engine door as the owner, and turn the engine's
 *   closed outcome into the contract's status and code (409 for a stale plan, a closed
 *   question or a wrong phase; 400 for a body the engine refuses; 404 for a missing card,
 *   plan or ticket). Nothing here writes storage itself, so the engine's tracked writes are
 *   what announce the change on the project stream.
 *
 * Exports: cardPlanRoutes().
 * Depends on: @forge/core (CardId, TicketId), schemas/plan-api, services/{card-reply,plan-refusal},
 *   services/http/*, types/routes. IO: calls the engine, reads storage.
 */

import { CardId, TicketId } from '@forge/core';
import type { EditPlanInput } from '@forge/engine';
import {
  GrillAnswerBody,
  GrillShortcutBody,
  PlanApproveBody,
  PlanChangesBody,
  PlanEditBody,
  PlanVersionParam,
} from '#/schemas/plan-api.js';
import { replyCard } from '#/services/card-reply.js';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import { planRefusal, ticketRefusal } from '#/services/plan-refusal.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

/** The `author` the engine records for every owner action. */
const OWNER = 'owner';

function cardIdOf(params: Record<string, string>): CardId {
  const id = CardId.safeParse(params['id']);
  if (!id.success) {
    throw new HttpError(400, 'invalid_card_id', 'card id must look like FG-C12');
  }

  return id.data;
}

function versionOf(raw: string | undefined): number {
  const version = PlanVersionParam.safeParse(raw);
  if (!version.success) {
    throw new HttpError(
      400,
      'invalid_version',
      'version must be a positive whole number',
    );
  }

  return version.data;
}

/** Drops the keys the client left out, so the engine sees absent fields rather than `undefined`. */
function editInput(body: PlanEditBody): EditPlanInput {
  return {
    tickets: body.tickets.map((t) => ({
      key: t.key,
      ...(t.title === undefined ? {} : { title: t.title }),
      ...(t.priority === undefined ? {} : { priority: t.priority }),
      ...(t.removed === undefined ? {} : { removed: t.removed }),
    })),
    ...(body.order === undefined ? {} : { order: body.order }),
  };
}

export function cardPlanRoutes(deps: RouteDeps): Route[] {
  const { engine } = deps;

  const plans: Route = {
    method: 'GET',
    path: '/cards/:id/plan',
    async handle({ res, params }) {
      const id = cardIdOf(params);
      const out = await engine.cardPlans(id);
      if (out.status !== 'ok') {
        throw planRefusal(out, id);
      }

      sendJson(res, 200, {
        versions: out.versions,
        current: out.current,
        floor: out.floor,
      });
    },
  };

  const planVersion: Route = {
    method: 'GET',
    path: '/cards/:id/plan/:version',
    async handle({ res, params }) {
      const id = cardIdOf(params);
      const out = await engine.cardPlan(id, versionOf(params['version']));
      if (out.status !== 'ok') {
        throw planRefusal(out, id);
      }

      sendJson(res, 200, { plan: out.plan });
    },
  };

  const answer: Route = {
    method: 'POST',
    path: '/cards/:id/grill/answer',
    async handle({ req, res, params }) {
      const id = cardIdOf(params);
      const body = await readJson(req, GrillAnswerBody);
      const out = await engine.answerGrill(
        id,
        {
          question_id: body.question_id,
          ...(body.option_id === undefined ? {} : { option_id: body.option_id }),
          ...(body.text === undefined ? {} : { text: body.text }),
        },
        OWNER,
      );

      if (out.status !== 'answered') {
        throw planRefusal(out, id);
      }

      sendJson(res, 200, { card: await replyCard(deps, out.card) });
    },
  };

  const shortcut: Route = {
    method: 'POST',
    path: '/cards/:id/grill/shortcut',
    async handle({ req, res, params }) {
      const id = cardIdOf(params);
      const body = await readJson(req, GrillShortcutBody);
      const out = await engine.grillShortcut(id, body.kind, OWNER);
      if (out.status !== 'applied') {
        throw planRefusal(out, id);
      }

      sendJson(res, 200, { card: await replyCard(deps, out.card) });
    },
  };

  const approve: Route = {
    method: 'POST',
    path: '/cards/:id/plan/approve',
    async handle({ req, res, params }) {
      const id = cardIdOf(params);
      const body = await readJson(req, PlanApproveBody);
      const out = await engine.approvePlan(id, body.version, OWNER);
      if (out.status !== 'approved') {
        throw planRefusal(out, id);
      }

      sendJson(res, 200, {
        card: await replyCard(deps, out.card),
        ticket_ids: out.ticket_ids,
      });
    },
  };

  const requestChanges: Route = {
    method: 'POST',
    path: '/cards/:id/plan/request-changes',
    async handle({ req, res, params }) {
      const id = cardIdOf(params);
      const body = await readJson(req, PlanChangesBody);
      const out = await engine.requestPlanChanges(id, body.version, body.comment, OWNER);
      if (out.status !== 'requested') {
        throw planRefusal(out, id);
      }

      sendJson(res, 200, { card: await replyCard(deps, out.card) });
    },
  };

  const editTickets: Route = {
    method: 'PATCH',
    path: '/cards/:id/plan/:version/tickets',
    async handle({ req, res, params }) {
      const id = cardIdOf(params);
      const version = versionOf(params['version']);
      const body = await readJson(req, PlanEditBody);
      const out = await engine.editPlanTickets(id, version, editInput(body), OWNER);
      if (out.status !== 'edited') {
        throw planRefusal(out, id);
      }

      sendJson(res, 200, { plan: out.plan });
    },
  };

  const start: Route = {
    method: 'POST',
    path: '/cards/:id/start-planning',
    async handle({ res, params }) {
      const id = cardIdOf(params);
      const out = await engine.startPlanning(id, OWNER);
      if (out.status !== 'started') {
        throw planRefusal(out, id);
      }

      sendJson(res, 200, { card: await replyCard(deps, out.card) });
    },
  };

  const retry: Route = {
    method: 'POST',
    path: '/cards/:id/planning/retry',
    async handle({ res, params }) {
      const id = cardIdOf(params);
      const out = await engine.retryPlanningStep(id, OWNER);
      if (out.status !== 'retried') {
        throw planRefusal(out, id);
      }

      sendJson(res, 200, { card: await replyCard(deps, out.card) });
    },
  };

  const express: Route = {
    method: 'POST',
    path: '/tickets/:id/run-as-express',
    async handle({ res, params }) {
      const parsed = TicketId.safeParse(params['id']);
      if (!parsed.success) {
        throw new HttpError(400, 'invalid_ticket_id', 'ticket id must look like FG-12');
      }

      const out = await engine.runAsExpress(parsed.data, OWNER);
      if (out.status !== 'released') {
        throw ticketRefusal(out, parsed.data);
      }

      sendJson(res, 200, { ticket_id: out.ticket.id });
    },
  };

  return [
    plans,
    planVersion,
    answer,
    shortcut,
    approve,
    requestChanges,
    editTickets,
    start,
    retry,
    express,
  ];
}
