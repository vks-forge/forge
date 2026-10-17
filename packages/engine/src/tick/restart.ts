/**
 * Restart reconcile: resume the runs the last server left behind.
 *
 * Why: a Worker that was an hour into a ticket when Forge stopped has a worktree full of
 *   changes and a harness session holding its whole conversation. Throwing both away as a
 *   crash (the old rule, d-0054) costs real work on every update or reboot, so the first tick
 *   resumes instead (d-0092). Two kinds of run are found: those the old server interrupted at
 *   shutdown, and those it lost without a shutdown (a crash or a killed process) that had
 *   already reported a harness session. Each is restarted on the same run row from its
 *   session, under a NEW generation, token and receipt secret (d-0100): the old token is
 *   replaced, so the dead Worker's credentials stop working, the hook liveness mark is cleared
 *   so the resumed process must register itself again before its first tool call (d-0033), and
 *   the app writes the `resumed` link into the receipt chain when it prepares the run. A run
 *   that cannot be resumed (no session, a harness that cannot resume, the worktree gone, a
 *   start that fails) is never lost: it is settled as a crash and the ticket is retried as a
 *   new run in the same worktree, so the Worker continues from the existing changes. A lost
 *   run with no session at all is crash-settled exactly as before. Resumes are due work like any
 *   other wake: they wait for the scheduler's global, per-project and per-harness limits, at
 *   the priority of their ticket and on the same rotation cursor as new starts. A start that
 *   fails before the chain's `resumed` link was written gives the generation back, so the
 *   chain stays 1, 2, 3 without a gap. Each run is resumed on its own: a project whose runtime
 *   cannot be built (or a store error) is reported as a tick error against that run, which stays
 *   interrupted for the next tick, while every other run still resumes.
 *
 * Exports: reconcileRestart(), resumeInterrupted().
 * Depends on: @forge/core (TERMINAL_STATUSES, branchName), @forge/tools (sha256Hex), domain/results,
 *   tick/{project-runtime,pump,resume-prompt,run-request,settle}, shared/time. IO only through the engine ports.
 */

import { TERMINAL_STATUSES, branchName } from '@forge/core';
import type { Run, TicketId } from '@forge/core';
import { sha256Hex } from '@forge/tools';
import { pickNext } from '#/domain/pick-next.js';
import { failureResult } from '#/domain/results.js';
import { ticketNumber } from '#/domain/ticket-numbers.js';
import { baseRefFor, driverFor, runtimeFor } from '#/tick/project-runtime.js';
import { startPump } from '#/tick/pump.js';
import { generationLinked } from '#/tick/resume-chain.js';
import { RESUME_PROMPT } from '#/tick/resume-prompt.js';
import { buildRunRequest } from '#/tick/run-request.js';
import { planDispatch } from '#/tick/schedule.js';
import { settleRun } from '#/tick/settle.js';
import { settleGuarded } from '#/tick/settle-guard.js';
import { isUnservable } from '#/tick/tick-config.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

const msg = (e: unknown): string => String(e instanceof Error ? e.message : e);

/** The session a resume loads: what shutdown captured, else what the pump last stored. */
const sessionOf = (run: Run): string | undefined =>
  run.resumable_session ?? run.session_ref;

/** Gives up on resuming `run`: settles it as a crash and wakes the ticket with `resume_failed`. */
async function giveUp(ctx: EngineCtx, run: Run, reason: string): Promise<void> {
  ctx.deps.log?.('warn', `run ${run.id} cannot be resumed: ${reason}; retrying`, {
    ticket: run.ticket_id,
  });

  ctx.report.resumeFailed.push(run.id);
  await settleGuarded(ctx, run, () =>
    settleRun(ctx, run, failureResult('crash', sessionOf(run) ?? null), undefined, {
      status: 'settled',
      retryReason: 'resume_failed',
    }),
  );
}

/**
 * Restarts `run` from `session`. Returns null once the harness was started, else why the run
 * cannot be resumed (nothing has been changed on the run row in that case).
 */
async function tryResume(
  ctx: EngineCtx,
  run: Run,
  session: string,
): Promise<string | null> {
  const { deps, state } = ctx;
  const ticket = await deps.storage.transaction((tx) =>
    tx.tickets.get(run.ticket_id as TicketId),
  );

  if (!ticket || TERMINAL_STATUSES.includes(ticket.status)) {
    return 'its ticket has ended';
  }

  if (ticket.assignee_run_id !== run.id) {
    return `its ticket is assigned to ${ticket.assignee_run_id ?? 'no run'}`;
  }

  const runtime = runtimeFor(ctx, ticket.project);
  if (!runtime) {
    return `project ${ticket.project} has no runtime on this server`;
  }

  let driver;
  try {
    driver = driverFor(ctx, ticket.project);
  } catch (e) {
    return msg(e);
  }

  if (!driver.capabilities().resume) {
    return 'its harness cannot resume a session';
  }

  let worktree;
  try {
    worktree = await runtime.worktrees.create(
      ticket.id,
      ticket.branch ?? branchName(ticket.type, ticket.id, ticket.title),
      baseRefFor(ctx, ticket.project),
    );
  } catch (e) {
    return `its worktree is unavailable: ${msg(e)}`;
  }

  if (worktree.path !== run.cwd) {
    return `its worktree is no longer at ${run.cwd}`;
  }

  const token = deps.ids.token();
  const generation = (run.generation ?? 1) + 1;
  const req = buildRunRequest(ctx, {
    runId: run.id,
    ticket,
    cwd: run.cwd,
    prompt: RESUME_PROMPT,
    promptHash: run.prompt_hash ?? sha256Hex(RESUME_PROMPT),
    token,
    resume: session,
    generation,
  });

  await deps.storage.transaction(async (tx) => {
    await tx.runs.update(run.id, {
      status: 'running',
      owner: deps.owner,
      generation,
      session_ref: session,
      last_event_at: ctx.nowIso,
      interrupted_at: undefined,
      resumable_session: undefined,
      hook_registered_at: undefined,
      pid: undefined,
    });

    // The old token stops working at once; only the hash of the new one is stored.
    await tx.runTokens.reissue(run.id, sha256Hex(token), ctx.nowIso);
  });

  state.baseShas.set(run.id, worktree.baseSha);
  try {
    const handle = await driver.start(req);
    startPump(deps, state, run.id, handle, driver, { resumed: true });
  } catch (e) {
    state.baseShas.delete(run.id);
    // The receipt chain must read generation 1, 2, 3 with a `resumed` link for each. When the
    // start failed before the link was written, the generation stored above never entered
    // the chain; leaving it would make the next resume link generation N+2 and G1 would fail
    // the chain at the join. The generation goes back to what the chain shows.
    const linked = await generationLinked(ctx, run.id, generation);
    await deps.storage.transaction((tx) =>
      tx.runs.update(run.id, {
        status: 'interrupted',
        interrupted_at: ctx.nowIso,
        resumable_session: session,
        ...(linked ? {} : { generation: run.generation ?? 1 }),
      }),
    );

    return `the harness did not start the session: ${msg(e)}`;
  }

  return null;
}

/** First tick only: marks the runs a crashed server left open as interrupted, or crash-settles those with no session. */
export async function reconcileRestart(ctx: EngineCtx): Promise<void> {
  const open = await ctx.deps.storage.transaction((tx) =>
    tx.runs.listByStatus(['starting', 'running', 'settling']),
  );

  for (const run of open) {
    if (run.owner === ctx.deps.owner) {
      continue;
    }

    if (!sessionOf(run)) {
      // Lost with nothing to resume from: the old rule, a crash that is retried.
      await settleGuarded(ctx, run, () => settleRun(ctx, run, failureResult('crash')));
      ctx.report.crashed.push(run.id);
      continue;
    }

    // Lost without a shutdown: recorded as interrupted, so it reads like a clean stop.
    await ctx.deps.storage.transaction((tx) =>
      tx.runs.update(run.id, { status: 'interrupted', interrupted_at: ctx.nowIso }),
    );
  }
}

/**
 * Every tick: resumes interrupted runs, within the scheduler's limits. A resume is committed
 * work that is due now, so `pickNext` orders it with the other due wakes and applies the
 * global, per-project and per-harness caps and any quota pause (d-0097); a run that does not
 * fit stays `interrupted` and is tried again next tick. A run with nothing to resume from is
 * given up at once, since waiting would not help it.
 */
export async function resumeInterrupted(ctx: EngineCtx): Promise<void> {
  const { deps, state } = ctx;
  const waiting = (
    await deps.storage.transaction((tx) => tx.runs.listByStatus(['interrupted']))
  ).filter((r) => !state.pumps.has(r.id) && !isUnservable(ctx.config, r.project ?? ''));

  if (waiting.length === 0) {
    return;
  }

  const candidates = new Map<string, Run>();
  for (const run of waiting) {
    if (sessionOf(run)) {
      candidates.set(run.id, run);
    } else {
      await giveUp(ctx, run, 'it has no harness session');
    }
  }

  if (candidates.size === 0) {
    return;
  }

  // Read-only: the dispatch phase of this tick consumes stale wakes and expired pauses once.
  const { plan, priorities } = await deps.storage.transaction(async (tx) => ({
    plan: await planDispatch(ctx, tx, false),
    priorities: new Map(
      await Promise.all(
        [...candidates.values()].map(async (run): Promise<[string, number]> => [
          run.id,
          (await tx.tickets.get(run.ticket_id as TicketId))?.priority ?? 0,
        ]),
      ),
    ),
  }));

  const pickable = [...candidates.values()].map((run) => ({
    id: run.id,
    project: run.project ?? '',
    harness: run.harness,
    priority: priorities.get(run.id) ?? 0,
    number: ticketNumber(run.ticket_id),
    wake: true,
    entering: false,
    blockedBy: [],
  }));

  // The same rotation cursor as dispatch, so resumes and new starts take turns fairly.
  const { picked, waits, cursor } = pickNext(
    pickable,
    plan.running,
    plan.caps,
    ctx.now,
    state.schedulerCursor,
  );

  state.schedulerCursor = cursor;
  for (const p of picked) {
    const run = candidates.get(p.id);
    const session = run ? sessionOf(run) : undefined;
    if (!run || !session) {
      continue;
    }

    try {
      const why = await tryResume(ctx, run, session);
      if (why === null) {
        ctx.report.resumed.push(run.id);
        deps.log?.('info', `run ${run.id} resumed from its session`, {
          ticket: run.ticket_id,
        });
      } else {
        await giveUp(ctx, run, why);
      }
    } catch (e) {
      // A throw here (a project runtime that cannot be rebuilt, a store error) belongs to this
      // run alone. It stays `interrupted` and is tried again next tick; the other runs go on.
      ctx.report.errors.push({ where: `resume ${run.id}`, message: msg(e) });
      deps.log?.('error', `resume of ${run.id} failed; it stays interrupted`, {
        ticket: run.ticket_id,
        error: msg(e),
      });
    }
  }

  for (const [id, wait] of waits) {
    deps.log?.('debug', `interrupted run ${id} waits to resume`, { wait });
  }
}
