/**
 * Planning research: the research step and the loop it shares with the grill's research detour.
 *
 * Why: a plan or a grill question sometimes rests on a fact the repository cannot answer (d-0144). The
 *   research step is a tool-less model call that answers with `research_requests` (searches and fetches) or
 *   with `findings`; the engine runs the requests (through the grant, the provenance check and the caps, in
 *   `research-run`), stores each page as a numbered source and, only when the findings arrive, checks every
 *   quote against the stored page text and writes the claims as evidence, all in one transaction with the
 *   step's result (`research-store`). The model never sets a claim's status and nothing it read is shown to
 *   a later step except those checked claims. The loop copies the planning reads' shape: at most
 *   `max_rounds` rounds of requests, then it must answer; a model that still asks is rejected like any other
 *   rejected step. A provider that is off, a run limit reached or a server that does not answer is a plain note on
 *   the card and an empty result, never a stop, so the plan is written and its outside claims stay unverified
 *   for the owner (d-0135). `runResearch` is the one function behind both entry points: the flow step and the
 *   grill detour.
 *
 * Exports: researchStep(), runResearch(), researchPreflight(), recordDetourTx(), OFF_NOTE.
 * Depends on: @forge/core (ResearchOutput), tick/research-run, tick/research-store, tick/research-known, tick/planning-input,
 *   tick/planning-state, tick/planning-step-io, tick/card-budget, types/card-planning, types/research-run.
 */

import { ResearchOutput } from '@forge/core';
import type {
  CardPlanningState,
  CardId,
  EvidenceOrigin,
  FlowStep,
  GrillState,
  ResearchResult,
  StorageTx,
} from '@forge/core';
import { addDirectorSpend } from '#/tick/card-budget.js';
import { cardInput, playbookOf, stepOf } from '#/tick/planning-input.js';
import { logPlanEvent, stamp } from '#/tick/planning-state.js';
import {
  callStep,
  finishStep,
  recordCarriedSpend,
  startStep,
} from '#/tick/planning-step-io.js';
import { claimsToCheck, knownUrls } from '#/tick/research-known.js';
import {
  fitResultsToPrompt,
  newResearchState,
  runRequests,
} from '#/tick/research-run.js';
import {
  countResearchRuns,
  evidenceInput,
  firstSourceNumber,
  loadEvidenceViews,
  storeResearchTx,
} from '#/tick/research-store.js';
import type { PlanCtx, StepOutcome } from '#/types/card-planning.types.js';
import type {
  ResearchAsk,
  ResearchEnd,
  ResearchRun,
} from '#/types/research-run.types.js';

export const OFF_NOTE =
  'Research is off, so nothing outside the repository was looked up. Turn it on in Forge settings, Research.';

const DOWN_NOTE =
  'The search provider did not answer, so nothing outside the repository was looked up. Check it in Forge settings, Research.';

/** Why no research can run for this card right now, in plain words, or null when it can. */
export async function researchPreflight(pc: PlanCtx): Promise<string | null> {
  const provider = pc.ctx.deps.research;
  if (!pc.research.enabled || !provider || !provider.capabilities().search) {
    return OFF_NOTE;
  }

  const cap = pc.director.research.max_runs_per_card;
  const runs = await pc.ctx.deps.storage.transaction((tx) =>
    countResearchRuns(tx, pc.card.id),
  );

  return runs >= cap
    ? `The research limit for this card (${cap} runs) is reached, so nothing more was looked up.`
    : null;
}

/** The input of one research call: the questions, what was found so far and what is left; no repository text. */
async function researchInput(
  pc: PlanCtx,
  step: FlowStep,
  g: GrillState,
  ask: ResearchAsk,
  results: readonly ResearchResult[],
  round: number,
  state: ReturnType<typeof newResearchState>,
): Promise<Record<string, unknown>> {
  const caps = pc.director.research;
  const views = await pc.ctx.deps.storage.transaction((tx) =>
    loadEvidenceViews(tx, pc.card.id),
  );

  const researchStepLike: FlowStep =
    step.kind === 'research'
      ? step
      : { ...step, kind: 'research', playbook_id: 'research' };

  return {
    step: stepOf(researchStepLike),
    playbook: playbookOf(pc, researchStepLike),
    house_rules: pc.director.house_rules,
    card: cardInput(pc),
    questions: ask.questions,
    claims_to_check: ask.claims,
    grill_answers: g.answers.map((a) => ({
      question: a.question,
      answer: a.answer,
      by: a.by,
    })),
    previous_steps: g.step_summaries,
    evidence_so_far: evidenceInput(views),
    results: fitResultsToPrompt(results),
    round,
    rounds_left: caps.max_rounds - round,
    limits: {
      searches_left: Math.max(0, caps.max_searches - state.searchCount),
      fetches_left: Math.max(0, caps.max_fetches - state.fetchCount),
      bytes_left: Math.max(0, caps.max_bytes - state.bytes),
    },
  };
}

/** A note on the card: the step kept asking for requests after its last round. */
async function failedWithRequests(pc: PlanCtx, step: FlowStep): Promise<void> {
  const message = 'it still asked for searches after the last research round';
  pc.ctx.report.rejectedSteps.push({
    step: 'research',
    ticketId: pc.card.id,
    reason: `invalid_output: ${message}`,
  });

  await pc.ctx.deps.storage.transaction((tx) =>
    logPlanEvent(tx, pc.card.id, stamp(pc), {
      kind: 'note',
      payload: {
        text: `The Director could not finish "${step.label}" (${message}). It will try again shortly.`,
      },
    }),
  );
}

/**
 * One research run. Returns what it learned in memory, nothing stored: the caller writes it in its own
 * transaction. `ok: false` carries the outcome the flow loop returns when a model call failed (already noted).
 */
export async function runResearch(
  pc: PlanCtx,
  step: FlowStep,
  g: GrillState,
  ask: ResearchAsk,
): Promise<ResearchRun> {
  const caps = pc.director.research;
  const first = await pc.ctx.deps.storage.transaction((tx) =>
    firstSourceNumber(tx, pc.card.id),
  );

  const state = newResearchState(first);
  const known = await knownUrls(pc, g);
  const results: ResearchResult[] = [];
  let cost = 0;
  for (let round = 0; round <= caps.max_rounds; round++) {
    const input = await researchInput(pc, step, g, ask, results, round, state);
    const call = await callStep(
      pc,
      step,
      'research',
      ResearchOutput,
      input,
      caps.step_budget_usd === undefined ? {} : { budgetUsd: caps.step_budget_usd },
    );

    cost += call.cost;
    if (!call.ok) {
      await recordCarriedSpend(pc, step, cost - call.cost);

      return { ok: false, outcome: call.outcome };
    }

    const out = call.value;
    if (out.findings !== undefined) {
      return { ok: true, end: finished(out.findings, state, cost) };
    }

    if (round === caps.max_rounds) {
      break;
    }

    results.push(...(await runRequests(pc, out.research_requests ?? [], state, known)));
    if (state.answered === 0 && state.unreachable > 0) {
      return {
        ok: true,
        end: { findings: null, state, cost: cost + state.costUsd, note: DOWN_NOTE },
      };
    }
  }

  await failedWithRequests(pc, step);

  return { ok: false, outcome: 'stop' };
}

function finished(
  findings: NonNullable<ResearchEnd['findings']>,
  state: ResearchEnd['state'],
  cost: number,
): ResearchEnd {
  const seen = findings.injection_seen;
  const note =
    seen.length > 0
      ? `Instructions aimed at the Director were found in ${seen.join(', ')} and ignored.`
      : undefined;

  return {
    findings,
    state,
    cost: cost + state.costUsd,
    ...(note === undefined ? {} : { note }),
  };
}

const summaryOf = (end: ResearchEnd): string => {
  const claims = end.findings?.claims.length ?? 0;
  const pages = end.state.sources.length;

  return end.findings
    ? `${end.findings.summary} (${pages} pages, ${claims} facts)`
    : (end.note ?? 'No research was done.');
};

/** The flow step: runs when the Director has not said it is unneeded; off, over its limit or unanswered is a note, never a stop. */
export async function researchStep(
  pc: PlanCtx,
  planning: CardPlanningState,
  index: number,
  step: FlowStep,
): Promise<StepOutcome> {
  await startStep(pc, step);
  const ask: ResearchAsk = { questions: [], claims: claimsToCheck(planning.grill) };
  const off = await researchPreflight(pc);
  let run: ResearchRun;
  if (off === null) {
    run = await runResearch(pc, step, planning.grill, ask);
  } else {
    run = {
      ok: true,
      end: { findings: null, state: newResearchState(1), cost: 0, note: off },
    };
  }

  if (!run.ok) {
    return run.outcome;
  }

  // An empty run still says what stayed open, so the owner and the plan know it was not looked up.
  const end: ResearchEnd = { ...run.end, open: ask.claims };
  await finishStep(pc, step, {
    index,
    files: [],
    summary: summaryOf(end),
    cost: end.cost,
    after: (tx) => storeResearchTx(tx, pc, end, 'research_step', step.id, stamp(pc)),
  });

  return 'continue';
}

/** Stores a grill detour's run and counts its cost on the card, in one transaction; the grill step's own cursor does not move. */
export async function recordDetourTx(
  tx: StorageTx,
  pc: PlanCtx,
  end: ResearchEnd,
  origin: EvidenceOrigin,
  stepId: string,
): Promise<void> {
  const at = stamp(pc);
  await storeResearchTx(tx, pc, end, origin, stepId, at);
  await addDirectorSpend(
    tx,
    pc.card.id as CardId,
    end.cost,
    at,
    pc.director.budget_warning_usd,
    { kind: 'research_detour' },
  );
}
