/**
 * Planning state helpers: load a card's planning context and write its events and flags.
 *
 * Why: every planning step needs the same facts (the card, its project and type, the
 *   Director settings in force for that project, the repository folder, the Tier C globs) and
 *   writes the same few things (an event on the card history, the owner-is-needed flag, the
 *   grill state). Doing both in one place keeps the settings read consistent with the tick's
 *   snapshot (so a step records the version it really ran under, d-0085) and keeps each flag or
 *   event write on its single door (`transitionCard()` for the flag, `logCardEvent` for the
 *   history), so a step cannot flip a card's phase or invent an event shape by hand.
 *
 * Exports: PLANNING_ACTOR, isPlannedType(), isPlanningPhase(), directorFor(), loadPlanCtx(),
 *   stamp(), logPlanEvent(), setNeedsYou(), askOwner(), askStepBudget(), mergeUnique(), enterVerifying(), latestPlanOf(), headOf().
 * Depends on: @forge/core (card schemas, config), tick/card-log, tick/card-phase, tick/tick-config,
 *   types/card-planning. Reads and writes inside the caller's transaction where it takes one.
 */

import { BUILTIN_DIRECTOR_CONFIG, PLANNING_PHASES, effectiveResearch } from '@forge/core';
import type {
  Card,
  CardId,
  CardPhase,
  CardType,
  DirectorConfig,
  NewCardEvent,
  PlanVersion,
  StorageTx,
} from '@forge/core';
import { iso } from '#/shared/time.js';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';
import { moveCardTx } from '#/tick/card-phase.js';
import { projectSettings } from '#/tick/tick-config.js';
import type { PlanCtx, PlanEvent } from '#/types/card-planning.types.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** Who the card history names for the Director's planning work. */
export const PLANNING_ACTOR = ENGINE_ACTOR;

/** Whether cards of this type are planned: Discussion cards are chat only, fast-path types make tickets at intake. */
export function isPlannedType(
  type: Pick<CardType, 'name' | 'tickets_on_intake'>,
): boolean {
  return !type.tickets_on_intake && type.name !== 'discussion';
}

export function isPlanningPhase(phase: CardPhase): boolean {
  return PLANNING_PHASES.includes(phase);
}

/** The Director settings in force for `slug` in this tick's snapshot, with the revision they came from. */
export function directorFor(
  ctx: EngineCtx,
  slug: string,
): { director: DirectorConfig; configVersion: number } {
  const view = ctx.config.projects.get(slug);

  return view
    ? {
        director: view.config.forge.director,
        configVersion: view.version.company + view.version.project,
      }
    : {
        director: ctx.config.forge.director ?? BUILTIN_DIRECTOR_CONFIG,
        configVersion: ctx.config.companyVersion,
      };
}

/** The card's planning context, or null when the card, its type or its project is gone or the card is closed. */
export async function loadPlanCtx(
  ctx: EngineCtx,
  cardId: CardId,
): Promise<PlanCtx | null> {
  const loaded = await ctx.deps.storage.transaction(async (tx) => {
    const card = await tx.cards.get(cardId);
    if (!card || card.closed_reason !== undefined) {
      return null;
    }

    const type = await tx.cardTypes.get(card.type);
    const project = await tx.projects.get(card.project);

    return type && project ? { card, type, project } : null;
  });

  if (!loaded) {
    return null;
  }

  const { director, configVersion } = directorFor(ctx, loaded.project.slug);

  return {
    ctx,
    ...loaded,
    director,
    research: effectiveResearch(
      ctx.config.projects.get(loaded.project.slug)?.config.forge.research ??
        ctx.config.forge.research,
      projectSettings(ctx.config, loaded.project.slug).research,
    ),
    configVersion,
    root: loaded.project.local_path ?? null,
    tierCGlobs: projectSettings(ctx.config, loaded.project.slug).tier_c_globs,
  };
}

/**
 * The time of a planning write: the clock now, not the tick's start. A step's model call takes
 * as long as it takes, so `step_started`, the result and the question each carry the moment they
 * were written, and the card page can tell a Director that is thinking from one that is stuck.
 */
export function stamp(pc: Pick<PlanCtx, 'ctx'>): string {
  return iso(pc.ctx.deps.clock.now());
}

/** Appends a card event written by the Director's planning flow. */
export function logPlanEvent(
  tx: StorageTx,
  cardId: CardId,
  at: string,
  event: PlanEvent,
): Promise<unknown> {
  return logCardEvent(tx, cardId, {
    ...event,
    at,
    actor: PLANNING_ACTOR,
  } as NewCardEvent);
}

/** Sets or clears the card's "waits on the owner" flag through the phase door; a no-op when it already is so. */
export async function setNeedsYou(
  tx: StorageTx,
  cardId: CardId,
  on: boolean,
  at: string,
): Promise<Card | null> {
  const card = await tx.cards.get(cardId);
  if (!card || card.needs_you === on) {
    return card;
  }

  const moved = await moveCardTx(
    tx,
    cardId,
    { type: on ? 'needs_you_set' : 'needs_you_cleared' },
    at,
  );

  return moved.ok ? moved.card : card;
}

/** Raises the card to Needs you with the reason and the actions the owner may take (no dead end, d-0135). */
export async function askOwner(
  tx: StorageTx,
  cardId: CardId,
  at: string,
  reason: string,
  actions: readonly ('answer' | 'approve_plan' | 'request_changes' | 'start_planning')[],
): Promise<void> {
  await logPlanEvent(tx, cardId, at, {
    kind: 'needs_you',
    payload: { reason, actions: [...actions] },
  });

  await setNeedsYou(tx, cardId, true, at);
}

/**
 * A Director step ran out of the per-step budget: no retry can succeed until the owner raises
 * it, so the card goes to Needs you with the two ways out (no dead end, d-0135). The note says
 * what to do; the reason names the step and the amount.
 */
export async function askStepBudget(
  tx: StorageTx,
  cardId: CardId,
  at: string,
  stepLabel: string,
  budgetUsd: number,
): Promise<void> {
  const usd = `$${budgetUsd.toFixed(2)}`;
  await logPlanEvent(tx, cardId, at, {
    kind: 'note',
    payload: {
      text: `The Director's step budget (${usd}) ran out during "${stepLabel}". Raise it in Settings → Limits, then Retry.`,
    },
  });

  await logPlanEvent(tx, cardId, at, {
    kind: 'needs_you',
    payload: {
      reason: `The Director's per-step budget (${usd}) is too small for "${stepLabel}".`,
      actions: ['raise_step_budget', 'retry_step'],
    },
  });

  await setNeedsYou(tx, cardId, true, at);
}

/** `base` followed by the items of `more` it does not hold yet; order kept. */
export function mergeUnique(base: readonly string[], more: readonly string[]): string[] {
  return [...new Set([...base, ...more])];
}

/** Moves the card from grilling to verifying the first time a verify-phase step starts. */
export async function enterVerifying(pc: PlanCtx): Promise<void> {
  await pc.ctx.deps.storage.transaction(async (tx) => {
    const card = await tx.cards.get(pc.card.id);
    if (card?.phase === 'grilling') {
      await moveCardTx(tx, pc.card.id, { type: 'start_verifying' }, stamp(pc));
    }
  });
}

/** The newest stored plan version of the card, or null before one exists. */
export function latestPlanOf(pc: PlanCtx): Promise<PlanVersion | null> {
  return pc.ctx.deps.storage.transaction((tx) => tx.cardPlanning.latestPlan(pc.card.id));
}

/** HEAD of the project's repository, or `unknown` when there is none (the floor then cannot compare). */
export async function headOf(pc: PlanCtx): Promise<string> {
  if (pc.root === null) {
    return 'unknown';
  }

  try {
    return await pc.ctx.deps.repoReader.headSha(pc.root);
  } catch {
    return 'unknown';
  }
}
