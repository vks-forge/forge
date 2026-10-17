/**
 * Schedule: reads everything the scheduling decision needs and hands it to `pickNext`.
 *
 * Why: which ticket gets the next slot depends on facts spread over several tables (waiting
 *   tickets and due wakes, live runs, parked harnesses, project status) and on the settings
 *   of this tick (the layered limits, each project's own cap and fallback harnesses, and the
 *   harness and fallback list of the ticket's agent). Both
 *   the dispatch phase and the ticket page's "why is this waiting?" need that same picture;
 *   building it in one place, from one transaction, means the page can only ever explain what
 *   dispatch would do. Only a project that is ready takes a slot: archived ones are history
 *   and onboarding ones are not checked yet. A harness whose quota reset time has passed has
 *   its pause cleared here, as the tick that sees it expire.
 *
 * Exports: planDispatch(), pickFrom().
 * Depends on: @forge/core, domain/pick-next, domain/harness-choice, domain/ticket-numbers,
 *   tick/run-agent, tick/wake-candidates, tick/tick-config, shared/time. IO only through the open transaction.
 */

import { PLANNING_PHASES } from '@forge/core';
import type { CardId, StorageTx, Ticket, TicketId } from '@forge/core';
import { chooseHarness } from '#/domain/harness-choice.js';
import { pickNext } from '#/domain/pick-next.js';
import { ticketNumber } from '#/domain/ticket-numbers.js';
import { FAR_FUTURE } from '#/shared/time.js';
import { resolveAgent } from '#/tick/run-agent.js';
import { classifyWake, wakeIsDue } from '#/tick/wake-candidates.js';
import { isUnservable, projectSettings } from '#/tick/tick-config.js';
import type {
  PausedHarness,
  PickCandidate,
  PickResult,
  PickRunning,
} from '#/types/pick-next.types.js';
import type { Candidate, DispatchPlan, ScheduleView } from '#/types/tick.types.js';

/** Blockers of `ticket` that are not done; a cancelled blocker never unblocks. */
async function openBlockers(tx: StorageTx, ticket: Ticket): Promise<string[]> {
  const open: string[] = [];
  for (const id of ticket.blocked_by) {
    if ((await tx.tickets.get(id))?.status !== 'done') {
      open.push(id);
    }
  }

  return open;
}

/** Parked harnesses still waiting at `now`; with `consume`, expired rows are deleted. */
async function pausedHarnesses(
  tx: StorageTx,
  now: number,
  consume: boolean,
): Promise<Record<string, PausedHarness>> {
  const paused: Record<string, PausedHarness> = {};
  for (const s of await tx.harnessState.list()) {
    const until = Date.parse(s.paused_until);
    if (until > now) {
      paused[s.harness_id] = { until, reason: s.reason };
    } else if (consume) {
      await tx.harnessState.clear(s.harness_id);
    }
  }

  return paused;
}

/**
 * Everything dispatch decides on, in one transaction. With `consume`, stale wakes are
 * consumed and expired harness pauses cleared; without it the read writes nothing.
 */
export async function planDispatch(
  view: ScheduleView,
  tx: StorageTx,
  consume: boolean,
): Promise<DispatchPlan> {
  const { engine } = view.config.forge;
  const wakes = await tx.wakeRequests.listDue(FAR_FUTURE);
  const waking = new Set(wakes.map((w) => w.ticket_id));
  const found: Candidate[] = [];
  for (const w of wakes.filter((x) => wakeIsDue(x, view.now))) {
    const c = await classifyWake(view, tx, w, consume);
    if (c) {
      found.push(c);
    }
  }

  const blockers = new Map<string, string[]>();
  for (const t of await tx.tickets.listByStatus('planned')) {
    if (!waking.has(t.id)) {
      found.push({ ticket: t, kind: 'new' });
      blockers.set(t.id, await openBlockers(tx, t));
    }
  }

  const projects = await tx.projects.list();
  const slugOf = new Map(projects.map((p) => [p.id, p.slug]));
  const ready = new Set(
    projects
      .filter((p) => p.status === 'ready' && !isUnservable(view.config, p.slug))
      .map((p) => p.id),
  );

  const paused = await pausedHarnesses(tx, view.now, consume);
  const installed = (id: string): boolean => view.deps.drivers.get(id) !== null;

  // Cards back in shaping (a re-plan) hold their not-started tickets: the new plan may replace them.
  const shaping = new Set<CardId>();
  for (const id of new Set(found.flatMap((c) => c.ticket.card_id ?? []))) {
    const card = await tx.cards.get(id);
    if (card && PLANNING_PHASES.includes(card.phase)) {
      shaping.add(id);
    }
  }

  const byId = new Map<string, Candidate>();
  const pickable: PickCandidate[] = [];
  for (const c of found.filter((x) => ready.has(x.ticket.project))) {
    const slug = slugOf.get(c.ticket.project) ?? c.ticket.project;
    const settings = projectSettings(view.config, slug);
    // The ticket's agent names its own harness; its fallback list, when it has one, replaces the company's (quota and harness-down only).
    const agent = resolveAgent(view.config, slug, c.ticket.lane);
    const fallbacks =
      agent.fallbackHarnesses.length > 0
        ? agent.fallbackHarnesses
        : (settings.harness_fallbacks ?? engine.harness_fallbacks);

    byId.set(c.ticket.id, c);
    pickable.push({
      id: c.ticket.id,
      project: c.ticket.project,
      harness: chooseHarness(agent.harnessId, fallbacks, paused, installed, view.now),
      priority: c.ticket.priority,
      number: ticketNumber(c.ticket.id),
      wake: c.wake !== undefined,
      entering: c.ticket.status !== 'in_progress',
      blockedBy: blockers.get(c.ticket.id) ?? [],
      awaitsPlan:
        c.ticket.status === 'planned' &&
        c.ticket.card_id !== undefined &&
        shaping.has(c.ticket.card_id),
    });
  }

  const byProject: Record<string, number> = {};
  for (const p of projects) {
    const own = projectSettings(view.config, p.slug).max_concurrent;
    if (own !== undefined) {
      byProject[p.id] = Math.min(own, engine.max_concurrent_per_project);
    }
  }

  // A run written before runs recorded their project is placed by its ticket.
  const running: PickRunning[] = [];
  for (const r of await tx.runs.listByStatus(['starting', 'running'])) {
    const project =
      r.project ?? (await tx.tickets.get(r.ticket_id as TicketId))?.project ?? '';

    running.push({ project, harness: r.harness });
  }

  return {
    candidates: byId,
    pickable,
    running,
    caps: {
      global: engine.max_concurrent_global,
      perProject: { default: engine.max_concurrent_per_project, byProject },
      perHarness: {
        default: engine.max_concurrent_per_harness.default,
        byId: engine.max_concurrent_per_harness.by_id,
      },
      inProgress: {
        used: (await tx.tickets.listByStatus('in_progress')).length,
        limit: engine.max_concurrent_by_state.in_progress ?? Number.POSITIVE_INFINITY,
      },
      paused,
    },
  };
}

/** `pickNext` over a plan, with the rotation continuing after `cursor`. */
export const pickFrom = (
  plan: DispatchPlan,
  now: number,
  cursor: string | undefined,
): PickResult => pickNext(plan.pickable, plan.running, plan.caps, now, cursor);
