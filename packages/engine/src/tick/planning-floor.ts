/**
 * Planning floor: gathers the facts the approval floor needs and asks it.
 *
 * Why: the floor itself is pure (core `checkFloor`), so the engine's job is to bring it true
 *   facts and to bring them fresh. The files of other cards come from their stored plans (only
 *   cards whose plan is approved and not done count, because only those will actually touch the
 *   files), and the files that changed under this plan since it was verified come from git
 *   between the plan's commit and HEAD now. When git cannot answer (the check itself fails) the
 *   floor is given a marker entry and fails: a floor that cannot tell must not pass (fail closed,
 *   code.md rule 6). A project with no repository has nothing to compare and is not blocked by it. A plan that
 *   makes a ticket's pipeline lighter than its lane's (a removed stage) is a breach too: only a person approves it.
 *
 * Exports: factsOf(), floorFactsFor(), computeFloor().
 * Depends on: @forge/core (checkFloor, plannedFiles), types/card-planning. Reads storage and the repo reader.
 */

import { checkFloor, plannedFiles } from '@forge/core';
import type { CardId, FloorResult, OtherCardFiles, PlanVersion } from '@forge/core';
import { removalsOf } from '#/tick/planning-pipelines.js';
import type { FloorFacts, PlanCtx } from '#/types/card-planning.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

const PAGE = 200;
const LIVE_PHASES = ['approved', 'queued', 'in_progress'];

/** Planned files of the project's other cards whose plan is approved and not done. */
async function otherCardFiles(pc: FloorFacts, selfId: string): Promise<OtherCardFiles[]> {
  return pc.deps.storage.transaction(async (tx) => {
    const out: OtherCardFiles[] = [];
    let after: { updated_at: string; id: string } | undefined;
    for (;;) {
      const page = await tx.cards.listByProject(pc.projectId, {
        limit: PAGE,
        ...(after === undefined ? {} : { after }),
      });

      for (const card of page) {
        if (card.id === selfId || !LIVE_PHASES.includes(card.phase)) {
          continue;
        }

        const plan = await tx.cardPlanning.latestPlan(card.id);
        if (plan) {
          out.push({ cardId: card.id, files: plannedFiles(plan) });
        }
      }

      const last = page[page.length - 1];
      if (page.length < PAGE || !last) {
        return out;
      }

      after = { updated_at: last.updated_at, id: last.id };
    }
  });
}

/** Files under the plan that moved in git since its base commit; a marker entry when git cannot say. */
async function movedSinceBase(pc: FloorFacts, plan: PlanVersion): Promise<string[]> {
  if (pc.root === null || plan.base_sha === 'unknown') {
    return [];
  }

  const reader = pc.deps.repoReader;
  try {
    const head = await reader.headSha(pc.root);

    return await reader.changedFiles(pc.root, plan.base_sha, head, plannedFiles(plan));
  } catch {
    return ['(git could not be checked)'];
  }
}

/** The floor's inputs for a card the tick is planning. */
export const factsOf = (pc: PlanCtx): FloorFacts => ({
  deps: pc.ctx.deps,
  projectId: pc.project.id,
  root: pc.root,
  tierCGlobs: pc.tierCGlobs,
});

/** The floor's inputs for a card an owner action or a read concerns (no tick in hand); null when the card or project is gone. */
export async function floorFactsFor(
  deps: EngineDeps,
  cardId: CardId,
): Promise<FloorFacts | null> {
  const found = await deps.storage.transaction(async (tx) => {
    const card = await tx.cards.get(cardId);

    return card ? await tx.projects.get(card.project) : null;
  });

  if (!found) {
    return null;
  }

  const settings = (await deps.config.project(found.slug)).config.project;

  return {
    deps,
    projectId: found.id,
    root: found.local_path ?? null,
    tierCGlobs: settings.tier_c_globs,
  };
}

/** The approval floor's verdict for `plan` against the facts as they are now. */
export async function computeFloor(
  facts: FloorFacts,
  plan: PlanVersion,
): Promise<FloorResult> {
  return checkFloor({
    plan,
    tierCGlobs: facts.tierCGlobs,
    otherPlannedFiles: await otherCardFiles(facts, plan.card_id),
    changedSinceBase: await movedSinceBase(facts, plan),
    // A ticket whose pipeline loses a stage of its lane's list is for the owner to approve (d-0141 item 6).
    lighter: removalsOf(plan.tickets),
    // A plan resting on an outside claim no verified evidence supports is for the owner to approve (d-0144).
    unverified: plan.verification.outside_claims
      .filter((c) => c.status === 'unverified')
      .map((c) => c.claim),
  });
}
