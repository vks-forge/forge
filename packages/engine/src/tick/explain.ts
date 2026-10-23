/**
 * Explain: where each ticket really is and why, from the scheduler's own decision.
 *
 * Why: a ticket's status is coarse. A reworked ticket reads In Progress while no Worker runs
 *   because the only slot is taken; a ticket in Needs you may have no question left to answer
 *   because the owner already chose Re-plan. The board and the ticket page need the real
 *   phase and one plain line, with the tickets that hold the slot named. It is computed by
 *   running the same scheduling decision dispatch runs, read-only, once for any number of
 *   tickets (a board must not plan once per tile), so what the page says can never differ from
 *   what the next tick does. Slot holders are the tickets with a live run, a workspace being
 *   prepared or a brief being written. A ticket in `waiting_human` with no open owner item is
 *   logged once as stuck unless its card is re-planning. `explainWait` keeps the older
 *   one-line scheduler string (`cap: per-project 1/1`) for the ticket page; it is null when
 *   nothing holds the ticket back.
 *
 * Exports: explainWaits(), explainWait().
 * Depends on: @forge/core, domain/wait-reason, domain/wait-text, shared/time, tick/schedule,
 *   tick/slot-holders, tick/tick-config, tick/quota. IO: reads storage and settings; writes nothing.
 */

import { EscalationAnswer, TERMINAL_STATUSES, derivePhase } from '@forge/core';
import type {
  Card,
  Interaction,
  StorageTx,
  Ticket,
  TicketId,
  TicketWait,
} from '@forge/core';
import { clockUtc, describeWait } from '#/domain/wait-reason.js';
import { waitText } from '#/domain/wait-text.js';
import { FAR_FUTURE, iso } from '#/shared/time.js';
import { QUOTA_WAIT } from '#/tick/quota.js';
import { pickFrom, planDispatch } from '#/tick/schedule.js';
import { holdersOf, slotHolders } from '#/tick/slot-holders.js';
import { loadTickConfig } from '#/tick/tick-config.js';
import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';
import type { WaitReason } from '#/types/pick-next.types.js';
import type { Explained, Scheduler } from '#/types/wait-text.types.js';

const jobRunning = (state: EngineState, id: string): boolean =>
  [state.gateJobs, state.stageJobs, state.checkJobs].some((jobs) =>
    [...jobs.values()].some((j) => j.ticketId === id && j.outcome === undefined),
  );

/** The latest answer the owner settled on a ticket's escalations, if any. */
function latestAnswer(rows: readonly Interaction[]): string | undefined {
  const settled = rows
    .filter((i) => i.status === 'answered' && i.answered_at !== undefined)
    .sort((a, b) => (b.answered_at ?? '').localeCompare(a.answered_at ?? ''));

  for (const i of settled) {
    const parsed = EscalationAnswer.safeParse(i.answer);
    if (parsed.success && parsed.data.by === 'owner') {
      return parsed.data.action;
    }
  }

  return undefined;
}

/** The scheduler's reason for a ticket it did not pick, or a wake set for later (quota reset, backoff). */
async function schedulerOf(
  tx: StorageTx,
  ticket: Ticket,
  found: WaitReason | undefined,
  picked: boolean,
  later: {
    wakes: Awaited<ReturnType<StorageTx['wakeRequests']['listDue']>>;
    now: number;
  },
  paused: Readonly<Record<string, { until: number }>>,
): Promise<{ scheduler?: Scheduler; line: string | null }> {
  if (found) {
    return { scheduler: found, line: describeWait(found) };
  }

  if (picked || TERMINAL_STATUSES.includes(ticket.status)) {
    return { line: null };
  }

  const wake = later.wakes.find(
    (w) =>
      w.ticket_id === ticket.id &&
      w.not_before !== undefined &&
      Date.parse(w.not_before) > later.now,
  );

  if (!wake?.not_before) {
    return { line: null };
  }

  const until = Date.parse(wake.not_before);
  const harness = (await tx.runs.listByTicket(ticket.id)).at(-1)?.harness;
  const park = harness === undefined ? undefined : paused[harness];
  if (wake.reason === QUOTA_WAIT && harness !== undefined && park) {
    return {
      scheduler: { kind: 'quota', harness, until: park.until, reason: '' },
      line: `quota: ${harness} until ${clockUtc(park.until)}`,
    };
  }

  return {
    scheduler: { kind: 'backoff', until },
    line: `retry: backing off until ${clockUtc(until)}`,
  };
}

async function explainAll(
  deps: EngineDeps,
  state: EngineState,
  ticketIds: readonly string[],
): Promise<Map<string, Explained>> {
  const config = await loadTickConfig(deps);
  const now = deps.clock.now();
  const view = { deps, state, config, now, nowIso: iso(now) };

  return deps.storage.transaction(async (tx) => {
    const plan = await planDispatch(view, tx, false);
    const result = pickFrom(plan, now, state.schedulerCursor);
    const tickets = new Map<string, Ticket>();
    for (const id of new Set(ticketIds)) {
      const t = await tx.tickets.get(id as TicketId);
      if (t) {
        tickets.set(id, t);
      }
    }

    const projectOf = async (id: string): Promise<string> =>
      tickets.get(id)?.project ?? (await tx.tickets.get(id as TicketId))?.project ?? '';

    const holders = await slotHolders(tx, state, projectOf);
    const liveRuns = new Set(
      holders.filter((h) => h.doing === 'working').map((h) => h.id),
    );

    const wakes = await tx.wakeRequests.listDue(FAR_FUTURE);
    const pending = await tx.interactions.listPending();
    const cards = new Map<string, Card | null>();
    const out = new Map<string, Explained>();

    for (const [id, ticket] of tickets) {
      const { scheduler, line } = await schedulerOf(
        tx,
        ticket,
        result.waits.get(id),
        result.picked.some((p) => p.id === id),
        { wakes, now },
        plan.caps.paused,
      );

      if (ticket.card_id !== undefined && !cards.has(ticket.card_id)) {
        cards.set(ticket.card_id, await tx.cards.get(ticket.card_id));
      }

      const card =
        ticket.card_id === undefined ? null : (cards.get(ticket.card_id) ?? null);

      const phase = derivePhase({
        status: ticket.status,
        liveRun: liveRuns.has(id),
        setupJob: holders.some((h) => h.id === id && h.doing !== 'working'),
        checkJob: jobRunning(state, id),
        openOwnerItems: pending.filter(
          (i) => i.ticket_id === id && i.escalated_at !== undefined,
        ).length,
        ...(scheduler === undefined ? {} : { schedulerWait: scheduler.kind }),
        ...(card === null ? {} : { cardPhase: card.phase }),
      });

      if (phase === 'stuck') {
        if (!state.stuckLogged.has(id)) {
          state.stuckLogged.add(id);
          deps.log?.('warn', `ticket ${id} waits on a person but no owner item is open`, {
            ticket: id,
            status: ticket.status,
            ...(ticket.card_id === undefined ? {} : { card: ticket.card_id }),
          });
        }
      } else {
        state.stuckLogged.delete(id);
      }

      const named =
        scheduler?.kind === 'cap'
          ? holdersOf(scheduler, holders, id, ticket.project)
          : [];

      const settledAction =
        ticket.status === 'waiting_human' &&
        (phase === 'stuck' || phase === 'held_by_plan')
          ? latestAnswer(await tx.interactions.listByTicket(id))
          : undefined;

      const blockers = scheduler?.kind === 'deps' ? scheduler.ids : [];
      const until =
        scheduler?.kind === 'quota' || scheduler?.kind === 'backoff'
          ? new Date(scheduler.until).toISOString()
          : undefined;

      out.set(id, {
        line,
        wait: {
          phase,
          text: waitText({
            phase,
            status: ticket.status,
            ...(ticket.card_id === undefined ? {} : { cardId: ticket.card_id }),
            ...(ticket.blocked_reason === undefined
              ? {}
              : { blockedReason: ticket.blocked_reason }),
            ...(scheduler === undefined ? {} : { scheduler }),
            holders: named,
            ...(settledAction === undefined ? {} : { settledAction }),
          }),
          ...(named.length === 0 ? {} : { holders: named.map((h) => h.id as TicketId) }),
          ...(blockers.length === 0 ? {} : { blockers: blockers as TicketId[] }),
          ...(ticket.card_id !== undefined &&
          (phase === 'held_by_plan' || phase === 'stuck')
            ? { card_id: ticket.card_id }
            : {}),
          ...(until === undefined ? {} : { since: until }),
        },
      });
    }

    return out;
  });
}

/** The phase and plain line of each ticket (unknown ids are left out); one scheduling decision serves them all. */
export async function explainWaits(
  deps: EngineDeps,
  state: EngineState,
  ticketIds: readonly string[],
): Promise<Map<string, TicketWait>> {
  const all = await explainAll(deps, state, ticketIds);

  return new Map([...all].map(([id, e]) => [id, e.wait]));
}

/** The wait reason line for `ticketId` (`quota: claude-code until 14:20 UTC`, `cap: per-project 1/1`, `deps: PAY-231`), or null when it is not waiting on the scheduler. */
export async function explainWait(
  deps: EngineDeps,
  state: EngineState,
  ticketId: string,
): Promise<string | null> {
  return (await explainAll(deps, state, [ticketId])).get(ticketId)?.line ?? null;
}
