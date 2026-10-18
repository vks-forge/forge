/**
 * Research routes: a card's evidence and sources, a run's sources, and the provider test.
 *
 * Why: what the Director found outside the repository must be readable by the owner as the engine checked it
 *   (d-0144): each claim with a verified or unverified verdict, its quotes and where it came from, and the
 *   stored page text behind any source so a quote can be checked by eye. The text is served as plain text in a
 *   JSON field for the web to show as text, never as markup, and only for a source the card itself fetched.
 *   A Worker's pages are listed by run so a review can be read next to what its run really read. The Test button
 *   asks the research wiring to check a provider, the saved one or unsaved values, and answers in a typed
 *   reply the page can phrase in plain words; it never writes. Everything is read from storage on each request.
 *
 * Exports: researchRoutes().
 * Depends on: @forge/core (evidence schemas and view join, SourceRef, CardId, ResearchTestBody), services/http/*,
 *   types/routes. IO: reads storage and settings.
 */

import { CardId, ResearchTestBody, SourceRef, evidenceViews } from '@forge/core';
import type { CardEvidenceReply, StorageTx } from '@forge/core';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

const PAGE = 200;
const DEFAULT_RUNS_CAP = 4;

function cardIdOf(raw: string | undefined): CardId {
  const id = CardId.safeParse(raw);
  if (!id.success) {
    throw new HttpError(400, 'invalid_card_id', 'card id must look like FG-C12');
  }

  return id.data;
}

/** How many research runs the card has had: each leaves one `research` event. */
async function runsUsed(tx: StorageTx, cardId: CardId): Promise<number> {
  let runs = 0;
  let afterSeq: number | undefined;
  for (;;) {
    const page = await tx.cardEvents.list(cardId, {
      ...(afterSeq === undefined ? {} : { afterSeq }),
      limit: PAGE,
    });

    runs += page.filter((e) => e.kind === 'research').length;
    const last = page[page.length - 1];
    if (page.length < PAGE || !last) {
      return runs;
    }

    afterSeq = last.seq;
  }
}

/** The per-card run limit in force for the card's project; the shipped default when its settings cannot be read. */
async function runsCap(deps: RouteDeps, project: string): Promise<number> {
  try {
    return (await deps.config.project(project)).config.forge.director.research
      .max_runs_per_card;
  } catch {
    return DEFAULT_RUNS_CAP;
  }
}

export function researchRoutes(deps: RouteDeps): Route[] {
  return [
    {
      method: 'GET',
      path: '/cards/:id/evidence',
      async handle({ res, params }) {
        const id = cardIdOf(params['id']);
        const found = await deps.storage.transaction(async (tx) => {
          const card = await tx.cards.get(id);
          if (!card) {
            return null;
          }

          const evidence = await tx.evidence.listByCard(id);
          const sources = await tx.researchSources.listByCard(id);

          return {
            project: card.project,
            reply: {
              evidence: evidenceViews(evidence, sources),
              sources,
              runs_used: await runsUsed(tx, id),
            },
          };
        });

        if (!found) {
          throw new HttpError(404, 'card_not_found', `no card ${id}`);
        }

        const reply: CardEvidenceReply = {
          ...found.reply,
          runs_cap: await runsCap(deps, found.project),
        };

        sendJson(res, 200, reply);
      },
    },
    {
      method: 'GET',
      path: '/cards/:id/sources/:ref',
      async handle({ res, params }) {
        const id = cardIdOf(params['id']);
        const ref = SourceRef.safeParse(params['ref']);
        const found = await deps.storage.transaction(async (tx) => {
          if (!(await tx.cards.get(id))) {
            return 'no_card' as const;
          }

          return ref.success ? await tx.researchSources.getByRef(id, ref.data) : null;
        });

        if (found === 'no_card') {
          throw new HttpError(404, 'card_not_found', `no card ${id}`);
        }

        if (!found) {
          throw new HttpError(
            404,
            'source_not_found',
            `card ${id} has no source ${params['ref'] ?? ''}`,
          );
        }

        sendJson(res, 200, found);
      },
    },
    {
      method: 'GET',
      path: '/runs/:id/sources',
      async handle({ res, params }) {
        const runId = params['id'] ?? '';
        const found = await deps.storage.transaction(async (tx) => {
          if (!(await tx.runs.get(runId))) {
            return null;
          }

          return tx.researchSources.listByRun(runId);
        });

        if (!found) {
          throw new HttpError(404, 'run_not_found', `no run ${runId}`);
        }

        sendJson(res, 200, { sources: found });
      },
    },
    {
      method: 'POST',
      path: '/settings/research/test',
      async handle(ctx) {
        const body = await readJson(ctx.req, ResearchTestBody);
        if (!deps.research) {
          throw new HttpError(503, 'not_available', 'research is not available here');
        }

        sendJson(ctx.res, 200, await deps.research.test(body.research));
      },
    },
  ];
}
