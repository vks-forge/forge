/**
 * Supervises one Worker run: event log, timers, receipt cross-check, final result.
 *
 * Why: whichever engine hosts the harness, the same things must hold. Every event is
 *   numbered, timestamped and validated before anyone sees it; a run that goes quiet for
 *   `stallMs`, or whose turn outlives `turnMs`, is cancelled and reported as a stall; and
 *   every tool call the harness is seen making must already have a decision receipt on the
 *   server, because on Windows the Worker's OS user can rewrite the hook (hook.json,
 *   hook.js) and the hook is only attribution. A call with no receipt after the grace
 *   window means the hook was bypassed, so the run is cancelled as `policy_denied`, unless
 *   the harness itself rejected the call in validation (`<tool_use_error>`), which happens
 *   before the hook and means the tool never ran. A call announced with a still-streaming input (ACP) is checked when it resolves, since its hook
 *   cannot run before the input is complete. The
 *   supervisor also notices a Worker that stopped right after `ask_director` and turns that
 *   into a `paused` result, and asks git (never the Worker) which files changed. Engines
 *   only translate a protocol into events and an end kind; this file decides what those
 *   mean for the Director (code.md rule 6: the driver reads the verdict, the hook decides).
 *
 * Exports: superviseRun().
 * Depends on: @forge/core (RunEvent, RunResult, InvalidInputError), @forge/tools (Decision),
 *   domain/run-result, domain/pending-ask, shared/call-tracker, shared/event-log,
 *   shared/await-decision, types/claude/*.
 *   IO: git through the injected port; timers through the injected clock.
 */

import { InvalidInputError, RunEvent, RunResult } from '@forge/core';
import type { UsageReport } from '@forge/core';
import type { Decision } from '@forge/tools';
import { findInteractionId, isAskTool } from '#/domain/pending-ask.js';
import { buildRunResult, familyOf } from '#/domain/run-result.js';
import type { Override } from '#/types/claude/run-result.types.js';
import type { SuperviseArgs, SupervisedRun } from '#/types/claude/supervisor.types.js';
import { awaitDecision } from '#/shared/await-decision.js';
import { createCallTracker } from '#/shared/call-tracker.js';
import { EventLog } from '#/shared/event-log.js';
import type {
  EngineEnd,
  EngineHandle,
  EngineSink,
  EventDraft,
  ToolCallRef,
} from '#/types/claude/engine.types.js';

const ZERO_USAGE: UsageReport = { in: 0, out: 0, cachedIn: 0, cacheWrite: 0 };
const noop = (): void => undefined;

export function superviseRun(a: SuperviseArgs): SupervisedRun {
  const { req, clock, log, config } = a;
  const events = new EventLog<RunEvent>();
  const askCalls = new Set<string>();
  const errorFamilies = new Set<string>();
  let seq = 0;
  let deliveries = 0;
  let session = a.startSession;
  let usage = ZERO_USAGE;
  let costUsd: number | null = null;
  let override: Override | null = null;
  let pendingAsk: string | null = null;
  let settling = false;
  let engine: EngineHandle | undefined;
  let engineCancel: Promise<void> | undefined;
  let cancelStall = noop;
  let cancelTurn = noop;
  let resolveResult: (r: RunResult) => void = noop;
  const result = new Promise<RunResult>((resolve) => (resolveResult = resolve));

  function touch(): void {
    if (settling) {
      return;
    }

    cancelStall();
    cancelStall = clock.after(req.budget.stallMs, () =>
      impose({ kind: 'stall', detail: `no event for ${req.budget.stallMs} ms` }),
    );
  }

  function cancelEngine(): Promise<void> {
    // Not memoised before the engine exists, so an override imposed during launch still cancels it.
    if (!engine) {
      return Promise.resolve();
    }

    engineCancel ??= engine.cancel();

    return engineCancel;
  }

  /** The driver's own verdict on the run; the first one wins and the engine is cancelled. */
  function impose(o: Override): void {
    if (override || settling) {
      return;
    }

    override = o;
    const family = familyOf(o.kind);
    if (family) {
      emit({ type: 'error', family, message: o.detail });
    }

    void cancelEngine().catch((e: unknown) =>
      log('warn', 'engine cancel failed', { error: String(e) }),
    );
  }

  const decisionFor = (call: ToolCallRef): Promise<Decision | null> =>
    awaitDecision(
      {
        receipts: a.receipts,
        clock,
        log,
        runId: req.runId,
        graceMs: config.receiptGraceMs,
        settling: () => settling,
      },
      call,
    );

  const tracker = createCallTracker(
    config.receiptCrossCheck,
    (ref) => void crossCheck(ref),
  );

  async function crossCheck(call: ToolCallRef): Promise<void> {
    const decision = await decisionFor(call);
    if (decision === null && !settling && !tracker.isRejected(call.id)) {
      impose({
        kind: 'policy_denied',
        detail: `tool call ${call.id} (${call.name}) has no server-side decision receipt`,
      });
    }
  }

  function inspect(e: RunEvent): void {
    tracker.onEvent(e);

    if (e.type === 'tool_call') {
      pendingAsk = null;
      if (isAskTool(e.name, req.mcpIdentity)) {
        askCalls.add(e.call_id);
      }
    } else if (e.type === 'tool_result' && askCalls.has(e.call_id) && !e.is_error) {
      pendingAsk = findInteractionId(e.output) ?? pendingAsk;
    } else if (e.type === 'error') {
      errorFamilies.add(e.family);
    }
  }

  function emit(draft: EventDraft): void {
    const ts = new Date(clock.now()).toISOString();
    const parsed = RunEvent.safeParse({ ...draft, seq, ts });
    if (!parsed.success) {
      log('warn', 'dropped malformed event', { type: draft.type });

      return;
    }

    seq += 1;
    events.push(parsed.data);
    touch();
    inspect(parsed.data);
  }

  const sink: EngineSink = {
    emit,
    activity: touch,
    setSession(ref) {
      session = ref;
      emit({ type: 'session', session_ref: ref });
    },
    setUsage: (u) => void (usage = u),
    setCostUsd: (c) => void (costUsd = c),
    turnStarted() {
      cancelTurn();
      cancelTurn = clock.after(req.budget.turnMs, () =>
        impose({ kind: 'turn_timeout', detail: `turn exceeded ${req.budget.turnMs} ms` }),
      );
    },
    turnEnded() {
      cancelTurn();
      cancelTurn = noop;
    },
    decisionFor,
    abort: (kind, detail) => impose({ kind, detail }),
  };

  async function settle(end: EngineEnd): Promise<void> {
    if (settling) {
      return;
    }

    settling = true;
    cancelStall();
    cancelTurn();
    if (end.kind === 'completed' && !override) {
      // Never resolved, yet the turn ended normally: its hook had every chance to run.
      for (const ref of tracker.unresolved()) {
        if ((await decisionFor(ref)) === null) {
          const detail = `tool call ${ref.id} (${ref.name}) has no server-side decision receipt`;
          override = { kind: 'policy_denied', detail };
          break;
        }
      }
    }

    tracker.clear();
    let files: string[] = [];
    if (a.base !== null) {
      try {
        files = await a.git.changedFiles(req.cwd, a.base);
      } catch (e) {
        log('warn', 'git changedFiles failed; reporting no files', { error: String(e) });
      }
    }

    const kind = override?.kind ?? end.kind;
    const family = familyOf(kind);
    if (family && !errorFamilies.has(family)) {
      emit({ type: 'error', family, message: override?.detail ?? end.detail ?? kind });
    }

    const built = RunResult.safeParse(
      buildRunResult({
        end,
        override,
        session,
        usage,
        costUsd,
        filesTouched: files,
        pendingAsk,
      }),
    );

    events.close();
    resolveResult(
      built.success
        ? built.data
        : {
            status: 'error',
            session,
            usage,
            costUsd,
            filesTouched: files,
            errorFamily: 'unknown',
          },
    );
  }

  touch();
  try {
    engine = a.launch(sink);
    engine.ended.then(settle, (e: unknown) =>
      settle({ kind: 'crash', detail: e instanceof Error ? e.message : String(e) }),
    );

    if (override) {
      void cancelEngine();
    }
  } catch (e) {
    void settle({ kind: 'crash', detail: e instanceof Error ? e.message : String(e) });
  }

  return {
    events,
    result,
    req,
    session: () => session,
    isSettled: () => settling,
    async steer(message, mode, inboxSeq) {
      if (settling || !engine) {
        throw new InvalidInputError('run has ended; start or resume a new run');
      }

      await engine.steer(message, mode);
      emit({ type: 'inbox_delivered', inbox_seq: inboxSeq ?? deliveries, mode });
      deliveries += 1;
    },
    async cancel() {
      if (settling) {
        return;
      }

      impose({ kind: 'cancelled', detail: 'cancelled by request' });
      await cancelEngine();
    },
  };
}
