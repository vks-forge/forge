/**
 * The grill's research detour: look an outside fact up, then take the same grill turn again.
 *
 * Why: the next question of the grill sometimes rests on a fact the repository cannot answer (a library's limit).
 *   Rather than guess, or ask the owner what a document can tell, the grill model may answer a turn with
 *   `research.questions` (d-0144). The engine then runs one research run (or says in a plain note why it
 *   cannot: research off, the per-card run limit reached, detours switched off) and calls the grill again with
 *   the checked evidence in its input. At most one detour happens per turn: the second call must ask a question
 *   or finish, and one that asks for research again is refused as invalid output. The detour's pages and claims
 *   are stored and its cost counted on the card in one transaction; the flow's cursor does not move, because
 *   the grill step has not finished.
 *
 * Exports: detourTurn().
 * Depends on: @forge/core (GrillTurnOutput), tick/planning-research, tick/planning-input, tick/planning-state,
 *   tick/planning-step-io, types/card-planning. Writes storage.
 */

import { GrillTurnOutput } from '@forge/core';
import type { FlowStep, GrillState, PlanVersion } from '@forge/core';
import { buildStepInput } from '#/tick/planning-input.js';
import {
  recordDetourTx,
  researchPreflight,
  runResearch,
} from '#/tick/planning-research.js';
import { logPlanEvent, stamp } from '#/tick/planning-state.js';
import { callStep } from '#/tick/planning-step-io.js';
import type { ModelCall, PlanCtx } from '#/types/card-planning.types.js';

/** After a research detour the model must ask or finish: a second detour in one turn is refused as invalid output. */
const AfterDetour = GrillTurnOutput.refine((o) => o.done || o.question !== undefined, {
  message:
    'research was already done for this turn: ask the question or finish the grill, do not ask for research again',
});

/**
 * The grill's research detour: one research run (or a note saying why there was none), then the same grill turn
 * again with the evidence in its input. The detour's pages and claims are stored and its cost counted on the
 * card; the flow's cursor does not move.
 */
export async function detourTurn(
  pc: PlanCtx,
  step: FlowStep,
  g: GrillState,
  previous: PlanVersion | null,
  questions: readonly string[],
): Promise<ModelCall<GrillTurnOutput>> {
  const refusal = pc.director.research.grill_detours
    ? await researchPreflight(pc)
    : 'Research during the grill is switched off for this project.';

  let used = false;
  if (refusal === null) {
    const run = await runResearch(pc, step, g, { questions, claims: [] });
    if (!run.ok) {
      return { ok: false, cost: 0, outcome: run.outcome };
    }

    await pc.ctx.deps.storage.transaction((tx) =>
      recordDetourTx(tx, pc, { ...run.end, open: questions }, 'grill_detour', step.id),
    );

    used = true;
  } else {
    await pc.ctx.deps.storage.transaction((tx) =>
      logPlanEvent(tx, pc.card.id, stamp(pc), {
        kind: 'director_message',
        payload: { text: `${refusal} The question goes on without it.` },
      }),
    );
  }

  const fresh = (
    await pc.ctx.deps.storage.transaction((tx) => tx.cardPlanning.get(pc.card.id))
  ).grill;

  const input = await buildStepInput(pc, fresh, step, previous, {
    research_detour: { done: used, note: refusal },
  });

  return callStep(pc, step, 'grill_turn', AfterDetour, input);
}
