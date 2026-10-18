/**
 * The Director's first look at a Worker's question: the `ticket_answer` step.
 *
 * Why: most questions a Worker asks are already settled in the plan, a decision or the repo's
 *   rules, so the owner should not be asked them; but a wrong answer costs a whole run and a real
 *   product choice must stay the owner's. The step sees the question, the ticket, the card's plan
 *   and the ticket's plan entry, the project's decisions and rejected approaches and its rule
 *   files, may ask the engine to read code (through `admit()` under the director grant, at most
 *   two rounds, like the planning steps), and answers with a decision. The engine, not the model,
 *   decides whether to use it (domain/escalation-decision): it must be sure enough, cite grounds,
 *   and the ticket must not be Tier C. Any error, parse failure or timeout hands the question to
 *   the owner at once with no suggestion: fail closed means ask the human. The step's cost counts
 *   on the card's budget as a warning, never a block (d-0143).
 *
 * Exports: lookAtQuestion().
 * Depends on: tick/memory-context (the memory shown to the Director), @forge/core (step schemas, escalation types), domain/escalation-decision, steps/run-step,
 *   tick/card-budget, tick/escalation-raise, tick/interactions, tick/plan-keys, tick/planning-input,
 *   tick/planning-reads, tick/planning-state, tick/tick-config. Reads and writes storage.
 */

import { TicketAnswerOutput } from '@forge/core';
import type {
  EscalationQuestion,
  Interaction,
  PlanVersion,
  Project,
  ReadRequest,
  Ticket,
} from '@forge/core';
import { canAutoAnswer, touchesTierC } from '#/domain/escalation-decision.js';
import { rejectStep, runStep } from '#/steps/run-step.js';
import { buildMemoryContext, questionOf } from '#/tick/memory-context.js';
import { addDirectorSpend } from '#/tick/card-budget.js';
import { handToOwner } from '#/tick/escalation-raise.js';
import { answerQuestionTx } from '#/tick/interactions.js';
import { planEntryOf } from '#/tick/plan-keys.js';
import { readRepoRules } from '#/tick/planning-input.js';
import { MAX_READ_ROUNDS, runReads } from '#/tick/planning-reads.js';
import { directorFor } from '#/tick/planning-state.js';
import { projectSettings } from '#/tick/tick-config.js';
import type { ReadBudget, ReadResult } from '#/types/card-planning.types.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** What the step is told about the card's plan: the parts that settle a Worker's question. */
const planBrief = (plan: PlanVersion | null): Record<string, unknown> | null =>
  plan === null
    ? null
    : {
        version: plan.version,
        goal: plan.goal,
        scope: plan.scope,
        non_goals: plan.non_goals,
        decisions: plan.decisions,
        assumptions: plan.assumptions,
        tickets: plan.tickets.map((t) => ({
          key: t.key,
          title: t.title,
          acceptance: t.acceptance,
          files: t.files,
        })),
      };

/** Hands the question to the owner as it is (no suggestion) and counts what the step cost. */
async function handOver(
  ctx: EngineCtx,
  row: Interaction,
  question: EscalationQuestion,
  cost: number,
  warnUsd: number,
  extra: Partial<EscalationQuestion> = {},
): Promise<void> {
  await ctx.deps.storage.transaction(async (tx) => {
    await addDirectorSpend(tx, row.card_id, cost, ctx.nowIso, warnUsd);
    await handToOwner(tx, ctx.nowIso, row, { ...question, ...extra });
  });
}

/**
 * Looks at one director-stage question: answers it alone when every safeguard holds, otherwise
 * hands it to the owner (with the model's suggestion and options when it gave any).
 */
export async function lookAtQuestion(
  ctx: EngineCtx,
  row: Interaction,
  ticket: Ticket,
  question: EscalationQuestion,
): Promise<void> {
  const loaded = await ctx.deps.storage.transaction(async (tx) => ({
    project: await tx.projects.get(ticket.project),
    card: ticket.card_id === undefined ? null : await tx.cards.get(ticket.card_id),
    plan:
      ticket.card_id === undefined
        ? null
        : await tx.cardPlanning.latestPlan(ticket.card_id),
    entry: await planEntryOf(tx, ticket),
  }));

  const project: Project | null = loaded.project;
  if (!project) {
    await handOver(ctx, row, question, 0, 0);

    return;
  }

  const slug = project.slug;
  const { director } = directorFor(ctx, slug);
  const root = project.local_path ?? null;
  const tierCGlobs = projectSettings(ctx.config, slug).tier_c_globs;
  const tierC = touchesTierC(
    ticket.tier_predicted,
    loaded.entry?.entry.files ?? [],
    tierCGlobs,
  );

  const memory = await buildMemoryContext(ctx, slug, {
    question: questionOf(ticket.title, ticket.body),
    rewrite: false,
  });

  const playbook = director.playbooks['answer-worker'];

  const base = {
    playbook: playbook
      ? { id: 'answer-worker', title: playbook.title, body: playbook.body }
      : null,
    house_rules: director.house_rules,
    question: { text: question.text, source: question.source, asked_at: row.asked_at },
    ticket: {
      id: ticket.id,
      title: ticket.title,
      body: ticket.body,
      type: ticket.type,
      lane: ticket.lane,
      tier_predicted: ticket.tier_predicted,
      planned_files: loaded.entry?.entry.files ?? [],
      acceptance: loaded.entry?.entry.acceptance ?? [],
    },
    card: loaded.card
      ? {
          id: loaded.card.id,
          title: loaded.card.title,
          summary: loaded.card.summary,
          phase: loaded.card.phase,
        }
      : null,
    plan: planBrief(loaded.plan),
    project_rules: {
      decisions: memory.decisions,
      rejected: memory.rejected,
      ...(memory.note === undefined ? {} : { note: memory.note }),
      repo_rules: await readRepoRules(ctx, root),
    },
    escalation: {
      answer_confidence: director.escalation.answer_confidence,
      tier_c: tierC,
    },
  };

  const caps = director.read_caps;
  const budget: ReadBudget = {
    filesLeft: caps.max_files,
    bytesLeft: caps.max_bytes,
    filesRead: [],
  };

  const results: ReadResult[] = [];
  let cost = 0;
  let out: TicketAnswerOutput | null = null;
  for (let round = 0; round <= MAX_READ_ROUNDS && out === null; round++) {
    const answer = await runStep(
      ctx,
      'ticket_answer',
      {
        ...base,
        read_results: results,
        read_round: round,
        reads_remaining: MAX_READ_ROUNDS - round,
        read_caps: { files_left: budget.filesLeft, bytes_left: budget.bytesLeft },
      },
      TicketAnswerOutput,
      {
        timeoutMs: director.step_timeouts_ms.ticket_answer,
        onCost: (usd) => {
          cost += usd;
        },
      },
    );

    if (!answer.ok) {
      rejectStep(ctx, 'ticket_answer', ticket.id, answer.error);
      await handOver(ctx, row, question, cost, director.budget_warning_usd);

      return;
    }

    const wanted: ReadRequest[] = answer.value.read_requests ?? [];
    if (wanted.length === 0) {
      out = answer.value;
    } else if (round < MAX_READ_ROUNDS) {
      results.push(...(await runReads({ ctx, root }, wanted, budget)));
    }
  }

  // Still asking for reads after the last round: nothing usable, ask the owner.
  if (out === null) {
    await handOver(ctx, row, question, cost, director.budget_warning_usd);

    return;
  }

  const verdict = canAutoAnswer(out, {
    threshold: director.escalation.answer_confidence,
    tierC,
    approvalMode: director.approval_mode,
  });

  if (verdict.answer) {
    const answered = await ctx.deps.storage.transaction(async (tx) => {
      const fresh = await tx.interactions.get(row.id);
      const done =
        fresh !== null &&
        (await answerQuestionTx(
          ctx.deps,
          tx,
          fresh,
          { action: 'answer', by: 'director', text: verdict.text },
          'engine',
        ));

      if (done) {
        await addDirectorSpend(
          tx,
          row.card_id,
          cost,
          ctx.nowIso,
          director.budget_warning_usd,
        );
      }

      return done;
    });

    if (answered) {
      return;
    }
  }

  const suggested =
    out.suggested_answer ?? (out.decision === 'answer' ? out.answer : undefined);

  await handOver(ctx, row, question, cost, director.budget_warning_usd, {
    ...(suggested === undefined ? {} : { suggested_answer: suggested }),
    options: out.options ?? [],
    director_note: verdict.answer
      ? 'The question was answered by someone else while the Director looked.'
      : verdict.note,
  });
}
